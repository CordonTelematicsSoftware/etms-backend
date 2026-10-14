import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Client from 'ssh2-sftp-client';
import { S3 } from 'aws-sdk';

@Injectable()
export class UploadService {
  private sftp: Client;
  private logger = new Logger(UploadService.name);
  config: any;
  constructor(private configService: ConfigService) {
    this.sftp = new Client();
  }
  getConfig = () => {
    const configuration = {
      host: this.configService.get<string>('SFTP_HOST'),
      port: this.configService.get<number>('SFTP_PORT'),
      username: this.configService.get<string>('SFTP_USERNAME'),
      password: this.configService.get<string>('SFTP_PASSWORD'),
    };
    return configuration;
  };
  // async checkAndCeateDirectory(remoteDirPath: string): Promise<void> {
  //   await this.sftp.end();
  //   const config = this.getConfig();
  //   await this.sftp.connect(config);

  //   const fullpath = `${this.configService.get<string>(
  //     'SFTP_PATH',
  //   )}/${remoteDirPath}`;
  //   await this.ensureDirectoryExists(fullpath);
  //   await this.sftp.end();
  // }
  private async ensureDirectoryExists(remoteDirPath: string): Promise<void> {
    try {
      const dirExists = await this.sftp.exists(remoteDirPath);
      if (!dirExists) {
        await this.sftp.mkdir(remoteDirPath, true);
      }
    } catch (err) {
      throw new Error(`Failed to ensure directory exists: ${err.message}`);
    }
  }

  // async upload(
  //   file: Express.Multer.File,
  //   fileName?: string,
  //   remotePath?: string,
  // ): Promise<any> {
  //   const { originalname, path } = file;
  //   try {
  //     const config = this.getConfig();
  //     await this.sftp.connect(config);
  //     if (remotePath) {
  //       const fullpath = `${this.configService.get<string>(
  //         'SFTP_PATH',
  //       )}/${remotePath}`;
  //       await this.ensureDirectoryExists(fullpath);
  //     }
  //     this.logger.log(`${fileName}, ${originalname}`);
  //     const ext = fpath.extname(file.originalname);
  //     let name = fileName || originalname;
  //     if (fileName?.trim().length) {
  //       name += ext;
  //     }

  //     this.logger.log(`Uploading file to ${name}`);
  //     const fullFileName = `${this.configService.get<string>(
  //       'SFTP_PATH',
  //     )}/${remotePath}/${name}`;
  //     const returnFilePath = `${this.configService.get<string>(
  //       'FILE_BASE_URL',
  //     )}/${remotePath}/${name}`;
  //     // this.logger.log(path, fullFileName);
  //     await this.sftp.put(path, fullFileName);
  //     await this.sftp.end();

  //     return `File uploaded successfully to ${returnFilePath}`;
  //   } catch (err) {
  //     throw new Error(`Failed to upload file: ${err.message}`);
  //   } finally {
  //     await fsPromises.unlink(path); // Clean up the local file after upload
  //   }
  // }
  getS3() {
    return new S3({
      region: this.configService.get('AWSREGION'),
      accessKeyId: this.configService.get('AWSACCESSKEYID'),
      secretAccessKey: this.configService.get('AWSSECRETACCESSKEY'),
    });
  }

  async uploadDocument(fileDetails) {
    const s3 = this.getS3();
    // ContentDisposition: 'attachment' forces the browser to download the file
    // instead of rendering it inline. This prevents SVG XSS and similar attacks
    // where a malicious file stored on S3 could execute scripts when opened in
    // the browser directly from the S3 URL.
    const params = {
      ...fileDetails,
      ContentDisposition: 'attachment',
    };
    return await s3
      .upload(params)
      .promise()
      .then((data) => {
        this.logger.verbose('Document Uploaded');
        return data.Location;
      });
  }

  async getDocument(fileDetails) {
    const s3 = await this.getS3();
    return await s3
      .getObject(fileDetails)
      .promise()
      .then((data) => {
        return data.Body.toString('utf-8');
      })
      .catch((err) => {
        this.logger.error('ERROR:', err);
      });
  }
}
