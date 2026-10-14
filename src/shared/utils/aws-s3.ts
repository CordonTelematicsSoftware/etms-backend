import { Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AWS = require('aws-sdk');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mime = require('mime-types');

const SIGNED_URL_TTL_SECONDS = 60 * 15;

// No class here to hang a logger field on, so one module-scope instance. Logger
// resolves the active logger at call time, so this still picks up whatever the
// app configures.
const logger = new Logger('AwsS3');

// A missing AWSBUCKETNAME is a static, process-wide misconfiguration, but
// signStoredS3Url runs once per URL and one approval list signs dozens. Logging
// per call would repeat the same line hundreds of times per request and bury the
// signal it exists to give, so warn once.
let warnedMissingBucket = false;
const warnMissingBucketOnce = () => {
  if (warnedMissingBucket) return;
  warnedMissingBucket = true;
  logger.warn(
    'AWSBUCKETNAME is not set - stored S3 URLs are being returned UNSIGNED. ' +
      'Every document link and image will 403 once the bucket is private.',
  );
};

let cachedS3: any;
const getS3 = () => {
  // Lazy so process.env is populated by ConfigModule before first use.
  if (!cachedS3) {
    cachedS3 = new AWS.S3({
      region: process.env.AWSREGION || 'ap-south-1',
      accessKeyId: process.env.AWSACCESSKEYID,
      secretAccessKey: process.env.AWSSECRETACCESSKEY,
    });
  }
  return cachedS3;
};

// getSignedUrl without a callback is synchronous local crypto - no network call.
const signKey = (key: string): string =>
  getS3().getSignedUrl('getObject', {
    Bucket: process.env.AWSBUCKETNAME,
    Key: key,
    Expires: SIGNED_URL_TTL_SECONDS,
  });

export const getPresignedUrl = async (
  folderName: string,
  fileName: string,
): Promise<string> => signKey(`${folderName}/${fileName}`);

// The DB stores full public S3 Locations, not keys. Same parse as the one proven
// in production at driver.service.ts:365 (downloadDriverDocuments).
export const signStoredS3Url = (storedUrl: string): string => {
  if (!storedUrl || typeof storedUrl !== 'string') return storedUrl;
  const parts = storedUrl.split('.amazonaws.com/');
  // Guard the driver.service.ts:365 trap: parts[1] undefined there yields the
  // literal string "undefined" rather than throwing.
  if (parts.length < 2 || !parts[1]) return storedUrl;
  // Already signed - hand it back untouched so this is idempotent. Re-signing
  // would fold the whole ?X-Amz-... query string into the Key and produce a valid
  // signature for an object that does not exist: a silent 403 on the image, no
  // exception and nothing in the logs.
  if (parts[1].includes('X-Amz-Signature=')) return storedUrl;
  // We can only sign objects in our own bucket. A row pointing anywhere else
  // (a legacy bucket, a different host) would otherwise get a valid signature
  // for a key that does not exist here - a hard 403 where it works today.
  const bucket = process.env.AWSBUCKETNAME;
  // Split out of the label check below so only this - a real misconfiguration -
  // warns. A URL in someone else's bucket is normal (org and vendor logos live in
  // publicBucket, plus legacy tt-hrms-files rows) and must stay silent.
  if (!bucket) {
    warnMissingBucketOnce();
    return storedUrl;
  }
  // parts[0] is 'https://<bucket>.s3.<region>' for a virtual-hosted URL. Match the
  // bucket LABEL exactly rather than as a substring, and require the next label to
  // be the s3 endpoint: a sibling bucket whose name merely contains ours
  // ('etms-uploads-2') or extends it with a dot ('etms-uploads.backup') would
  // otherwise be signed against the wrong bucket and 403. A path-style URL yields
  // 'https://s3.<region>', whose first label is 's3', so it is rejected - which is
  // what happens today. Covers both 's3.<region>' and legacy 's3-<region>'.
  const labels = parts[0].replace(/^https?:\/\//, '').split('.');
  if (labels[0] !== bucket || !labels[1]?.startsWith('s3')) return storedUrl;
  try {
    return signKey(decodeURIComponent(parts[1]));
  } catch (err) {
    // malformed %-escape or signing failure: hand back the raw URL. Logged per
    // occurrence, unlike the missing-bucket case: this is data-dependent, and the
    // key is what identifies the bad object. err.message rather than err so SDK
    // config cannot serialize into the log.
    logger.warn(
      `Failed to sign S3 key "${parts[1]}" - returning it UNSIGNED: ${
        err?.message ?? err
      }`,
    );
    return storedUrl;
  }
};

// Inverse of signStoredS3Url, for write paths where the client legitimately
// echoes back a URL it was shown. Stored values are always the plain S3 Location
// (upload.service.ts:110) with no query string, so dropping everything from '?'
// restores the canonical URL and is a no-op for every row written before
// signing. Non-strings pass through untouched.
export const stripS3QueryString = (url: any): any =>
  typeof url === 'string' ? url.split('?')[0] : url;

const toPlain = (node: any): any =>
  typeof node?.toJSON === 'function' ? node.toJSON() : { ...node };

// A terminal value is either one URL or an array of them (Grievances.attachments
// is a JSONB string[]). Non-strings pass through untouched.
const signTerminal = (value: any): any => {
  if (typeof value === 'string') return signStoredS3Url(value);
  if (Array.isArray(value))
    return value.map((v) => (typeof v === 'string' ? signStoredS3Url(v) : v));
  return value;
};

// Walks one field spec. Segments are dot-separated and a segment ending in '[]'
// iterates that array, so 'driver.documents[].url' is supported alongside a plain
// 'image'. Copy-on-write at every level: listAllDrivers (driver.service.ts:989)
// hands us rows it still holds a reference to, and {...row} is only a shallow
// copy, so mutating a nested object in place would write through to the caller.
const applyFieldPath = (node: any, segments: string[]): void => {
  const [head, ...rest] = segments;
  const iterate = head.endsWith('[]');
  const key = iterate ? head.slice(0, -2) : head;
  if (!key) return;
  const value = node[key];
  // Absent or null: leave the key exactly as it was, never introduce one.
  if (value === null || value === undefined) return;

  if (rest.length === 0) {
    node[key] = signTerminal(value);
    return;
  }
  if (iterate) {
    if (!Array.isArray(value)) return;
    node[key] = value.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const child = toPlain(item);
      // toJSON() can return anything, null included - do not recurse into it.
      if (!child || typeof child !== 'object') return item;
      applyFieldPath(child, rest);
      return child;
    });
    return;
  }
  if (typeof value !== 'object' || Array.isArray(value)) return;
  const child = toPlain(value);
  if (!child || typeof child !== 'object') return;
  applyFieldPath(child, rest);
  node[key] = child;
};

// Re-signs the named fields on a row or array of rows, preserving field names so
// response shapes do not change. Sequelize instances are toJSON()'d first (same
// output Nest would serialize anyway), which also deep-plains nested includes.
export const signS3UrlFields = (row: any, fields: string[]): any => {
  if (!row) return row;
  if (Array.isArray(row)) return row.map((r) => signS3UrlFields(r, fields));
  const plain = toPlain(row);
  for (const field of fields) {
    applyFieldPath(plain, field.split('.'));
  }
  return plain;
};

export const getUploadUrl = async (
  folderName: string,
  fileName: string,
): Promise<string> => {
  // Folder Name + File Name - Set in controller
  const SUPPORTED_FORMATS = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
  ];
  const contentType = mime.lookup(fileName) || 'application/octet-stream';
  if (!SUPPORTED_FORMATS.includes(contentType)) {
    throw new Error('Unsupported file format');
  }
  const signedUrlExpireSeconds = 60 * 5;
  const s3 = new AWS.S3({
    region: 'ap-south-1',
    accessKeyId: process.env.AWSACCESSKEYID,
    secretAccessKey: process.env.AWSSECRETACCESSKEY,
  });
  const params = {
    Bucket: 'tt-hrms-files',
    Key: `${folderName}/${fileName}`,
    ContentType: contentType,
    ACL: 'private',
    Expires: signedUrlExpireSeconds,
  };

  const url = await s3.getSignedUrl('putObject', params);
  return url;
};

export const uploadFile = async (
  // This will not work in server if file is uploaded from cloudfront.
  // Body of the request will not be pased to lambda
  fileName: string, // Folder Name + File Name
  file: Express.Multer.File,
) => {
  const s3 = new AWS.S3({
    region: 'ap-south-1',
    accessKeyId: process.env.AWSACCESSKEYID,
    secretAccessKey: process.env.AWSSECRETACCESSKEY,
  });
  const fileDetails = {
    Bucket: 'tt-hrms-files',
    Key: `${fileName}`,
    Body: file.buffer,
    ContentDisposition: `"inline"`,
    ACL: 'private',
    ContentType: file.mimetype,
  };

  return await s3
    .upload(fileDetails, async function (err) {
      if (err) this.logger.error('ERROR:', err);
    })
    .promise()
    .then((data) => {
      return data.Location;
    });
};
