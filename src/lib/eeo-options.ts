// Standard US EEOC voluntary self-identification options, shared by the profile
// editor and the signup wizard. Values are stored on the profile and used to
// auto-fill the matching ATS questions (mapped to each vendor's exact wording at
// fill time). Race values are kept "clean" (no "(Not Hispanic…)" suffix) so the
// derived Hispanic/Latino yes-no question resolves correctly.

export interface EeoOption {
  value: string;
  label: string;
}

export const GENDER_OPTIONS: EeoOption[] = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Non-binary", label: "Non-binary" },
  { value: "Decline to self-identify", label: "Decline to self-identify" },
];

export const RACE_OPTIONS: EeoOption[] = [
  { value: "Hispanic or Latino", label: "Hispanic or Latino" },
  { value: "White", label: "White" },
  { value: "Black or African American", label: "Black or African American" },
  { value: "Asian", label: "Asian" },
  { value: "Native Hawaiian or Other Pacific Islander", label: "Native Hawaiian or Other Pacific Islander" },
  { value: "American Indian or Alaska Native", label: "American Indian or Alaska Native" },
  { value: "Two or More Races", label: "Two or More Races" },
  { value: "Decline to self-identify", label: "Decline to self-identify" },
];

export const VETERAN_OPTIONS: EeoOption[] = [
  { value: "I am not a protected veteran", label: "I am not a protected veteran" },
  {
    value: "I identify as one or more of the classifications of a protected veteran",
    label: "I am a protected veteran",
  },
  { value: "I don't wish to answer", label: "Decline to self-identify" },
];

export const DISABILITY_OPTIONS: EeoOption[] = [
  {
    value: "No, I do not have a disability and have not had one in the past",
    label: "No, I do not have a disability",
  },
  {
    value: "Yes, I have a disability, or have had one in the past",
    label: "Yes, I have a disability (or had one)",
  },
  { value: "I do not want to answer", label: "Decline to self-identify" },
];

export const EEO_FIELD_OPTIONS: Record<string, EeoOption[]> = {
  gender: GENDER_OPTIONS,
  raceEthnicity: RACE_OPTIONS,
  veteranStatus: VETERAN_OPTIONS,
  disabilityStatus: DISABILITY_OPTIONS,
};
