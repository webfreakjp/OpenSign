import axios from "axios";

export async function markTourCompleted(
  tourKey,
  { className = "contracts_Users", objectId } = {}
) {
  const profiles = JSON.parse(localStorage.getItem("Extand_Class") || "[]");
  const profileId =
    objectId || (className === "contracts_Users" && profiles?.[0]?.objectId);
  const sessionToken = localStorage.getItem("accesstoken");
  if (!profileId || !sessionToken) {
    throw new Error(
      "A signed-in profile is required to save tour preferences."
    );
  }

  const completed = { [tourKey]: true };
  await axios.put(
    `${localStorage.getItem("baseUrl")}classes/${className}/${profileId}`,
    // Append atomically so another screen's saved tours cannot be overwritten
    // by an older copy of TourStatus. Repeated dismissals are idempotent.
    { TourStatus: { __op: "AddUnique", objects: [completed] } },
    {
      headers: {
        "X-Parse-Application-Id": localStorage.getItem("parseAppId"),
        "X-Parse-Session-Token": sessionToken
      }
    }
  );

  if (className === "contracts_Users") {
    // Read again after saving: another screen may have refreshed the cache.
    const currentProfiles = JSON.parse(
      localStorage.getItem("Extand_Class") || "[]"
    );
    const profile = currentProfiles?.find(
      (user) => user.objectId === profileId
    );
    if (profile) {
      const status = profile.TourStatus || [];
      if (!status.some((tour) => tour[tourKey] === true)) {
        profile.TourStatus = [...status, completed];
        localStorage.setItem("Extand_Class", JSON.stringify(currentProfiles));
      }
    }
  }
}
