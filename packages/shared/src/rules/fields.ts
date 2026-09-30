export const FIELD_LIMITS = {
  firstName: { max: 50 },
  lastName: { max: 50 },
  username: { min: 3, max: 30 },
  email: { max: 255 },
  password: { min: 8, max: 128 },
} as const;
