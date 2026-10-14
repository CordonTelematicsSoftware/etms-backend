import { IsString, IsNotEmpty, IsNumber } from 'class-validator';
export class CreateEventLogDto {
  @IsNotEmpty()
  @IsString()
  objectType: string;

  @IsNotEmpty()
  objectID: any;

  @IsNotEmpty()
  @IsString()
  changeType: string;

  requestPayload: any;

  payload: any;

  @IsNotEmpty()
  @IsString()
  updatedBy: string;

  @IsNotEmpty()
  @IsNumber()
  authID: bigint;

  customDescription?: string;

  // Pre-built per-field diff. When supplied it is stored as-is instead of
  // deriving one from payload/requestPayload, which callers need when the
  // change includes falsy new values.
  changeJSON?: Record<string, any>;

  // The LIVE session/request user (e.g. req.user from @CurrentUser()) -
  // NOT the same thing as a fresh Authentication DB row looked up by
  // authID. Needed because a SuperAdmin who has switched into an
  // organization only has that fact recorded in their live session's
  // orgID; the permanent Authentication row for their authID always says
  // userType: 'SuperAdmin', employeeID: null, switch or no switch. Pass
  // this whenever it's available (it's almost always the same `user`
  // object the call site already has from @CurrentUser()) so
  // EventLogService can resolve org/vendor scope correctly for switched
  // actions. Optional and backward-compatible: omitting it just falls
  // back to the older authID-derived resolution.
  user?: any;

  // Accepted for backward compatibility with the many existing call sites
  // that pass these, but NEITHER is actually read by create()/bulkCreate()
  // - the persisted orgID/vendorID always comes from resolveLogScope(),
  // driven by authID/user above. Declared here purely so TypeScript's
  // excess-property check doesn't reject a call site that passes one
  // directly as an object literal (most existing call sites dodge this by
  // routing through an intermediate variable first, which TypeScript
  // checks less strictly - a direct literal argument, like
  // eventlogService.create({...}), gets the full check).
  orgID?: any;

  vendorID?: any;

  // When true (and the acting user is a vendor with a live orgID also
  // present in session), scopes this row to the vendor itself
  // (orgID: null, vendorID: <theirs>) rather than the currently-selected
  // org - so every org that has approved this vendor sees it via
  // buildScopeWhere()'s approved-vendor OR-branch, not just whichever
  // org happened to be selected at write time. Use for vendor actions
  // that are inherently vendor-level (e.g. editing their own Driver/Cab
  // record), never for trip-specific actions, which must stay strictly
  // isolated to the trip's real org.
  visibleToAllApprovedOrgs?: boolean;
}
