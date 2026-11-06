import type { ParkingPassEvent } from "./api";

export const parkingPassEventLabels: Record<ParkingPassEvent["event_type"], string> = {
  created: "Printed",
  activated: "Activated",
  replaced: "Replaced by a new pass",
  reported_lost: "Reported lost",
  deactivated: "Deactivated by admin",
  device_deleted: "Vehicle deleted",
};

// Passes are referred to by their last four characters, like a card number.
export function shortPassId(passUuid: string | null | undefined): string {
  return passUuid ? `••••${passUuid.slice(-4)}` : "";
}
