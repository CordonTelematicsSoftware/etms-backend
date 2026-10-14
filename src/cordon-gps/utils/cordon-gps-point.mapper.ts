import {
  CordonBatchPoint,
  CordonPoint,
  GpsPoint,
} from '../interfaces/cordon-gps.interfaces';

export function cordonGpsPointToGpsPoint(point: CordonPoint): GpsPoint | null {
  if (!point.curlocationval) {
    return null;
  }

  return {
    geocode: point.curlocationval,
    speed: point.speed,
    createdAt: point.curtimeval,
    deviceId: point.device_id,
    panic: point.panic,
    ignitionStatus: point.ignition_status,
    gpsFix: point.gps_fix,
    direction: point.curdirection,
    address: point.fulladdress,
    rtoNo: point.rto_no,
  };
}

export function cordonBatchPointToGpsPoint(
  point: CordonBatchPoint,
): GpsPoint | null {
  if (!point.curlocationval) {
    return null;
  }

  return {
    geocode: point.curlocationval,
    speed: point.speed,
    createdAt: point.curtimeval,
    deviceId: point.device_id,
    panic: point.panic ?? '',
    ignitionStatus: point.ignition_status,
    gpsFix: point.gps_fix,
    direction: point.curdirection,
    address: point.fulladdress,
    rtoNo: point.rto_no,
  };
}
