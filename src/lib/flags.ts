// Client feature flags.
//
// BEACONS_ENABLED — temporary kill switch for the campus beacon
// ("find my device") features: the beacon-location fetches on the Map
// Overview and Campus Devices screens, and the Map Overview 15s poller.
// While false, fetchSchoolBeaconLocations() resolves to [] without a network
// call and the poller is not scheduled. Flip to true to restore.
export const BEACONS_ENABLED = false;
