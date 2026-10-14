export enum UserType {
  SuperAdmin = 'SuperAdmin',
  Admin = 'Admin',
  Member = 'Member',
  Employee = 'Employee',
  TeamLead = 'Team Lead',
  Vendor = 'Vendor',
  Transport = 'Transport Team',
  Driver = 'Driver',
}

export enum EndPoint {
  Admin = 'Admin',
  Employee = 'Employee',
  Vendor = 'Vendor',
}

export enum EmployeeType {
  Admin = 'Admin',
  Employee = 'Employee',
  Transportation = 'Transport Team',
  Security = 'Security Manager',
  Guest = 'Guest Employee',
  '' = '',
}

export enum AuthenticationType {
  Normal = 'Normal',
  Google = 'Google',
  FaceBook = 'Facebook',
  LinkedIn = 'Linkedin',
}

export enum Status {
  Active = 'Active',
  Inactive = 'Inactive',
  Requested = 'Requested',
  Rejected = 'Rejected',
  Approved = 'Approved',
  Cancelled = 'Cancelled',
  EmployeeSelfNoShow = 'Employee-Self-No-Show',
}

export enum EmergencyType {
  Emergency = 'Emergency',
  AdHoc = 'AdHoc',
  Medical = 'Medical',
}

export enum RequestStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
  Cancelled = 'Cancelled',
  Invited = 'Invited',
  Requested = 'Requested',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}
export enum RoleType {
  Owner = 'Owner',
  Staff = 'Staff',
  Member = 'Member',
}

export enum SequelizeErrors {
  Unhandled = 'SequelizeDatabaseError',
  Validation = 'SequelizeValidationError',
}
export enum Gender {
  Male = 'Male',
  Female = 'Female',
  Other = 'Other',
}

export enum APIEndpoint {
  Admin = 'Admin',
  Member = 'Member',
}

export enum ApprovalStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
  Cancelled = 'Cancelled',
}

export enum PickDrop {
  Pick = 'Pick',
  Drop = 'Drop',
}

export const BillingPlans = {
  PerKMBilling: 'Per KM Billing',
  PerTripSlabBilling: 'Per Trip & Slab Billing',
  PerTripMultiSlabBilling: 'Per Trip Multi-Slab Billing',
};

export const TripStatus = {
  Pending: 'Pending',
  Assigned: 'Assigned',
  Confirmed: 'Confirmed',
  Ongoing: 'Ongoing',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
};

export enum CallStatus {
  Answered = 'Answered',
  Busy = 'Busy',
  NoAnswer = 'No Answer',
  Failed = 'Failed',
  Missed = 'Missed',
  Completed = 'Completed',
}

export enum ReadStatus {
  Pending = 'Pending',
  Closed = 'Closed',
}

export enum DateRangeType {
  Months = 'Months',
  Weeks = 'Weeks',
  Years = 'Years',
  Days = 'Days',
}

/**
 * Derived safe-home outcome for the safe-home report. Not a stored column —
 * computed from TripRequest.safeHome plus the IVR digit pressed.
 */
export const SAFE_HOME_STATUS = {
  SAFE_PIN: 'Safe - PIN',
  SAFE_IVR: 'Safe - IVR',
  // "Reported", not "Declined": pressing 2 is the employee actively reporting
  // she is not safe. "Declined" read as "did not pick up", which is the other
  // outcome entirely (NOT_SAFE_NO_ANSWER).
  NOT_SAFE_REPORTED: 'Not Safe - Reported',
  NOT_SAFE_NO_ANSWER: 'Not Safe - No Answer',
  PENDING: 'Pending',
};
