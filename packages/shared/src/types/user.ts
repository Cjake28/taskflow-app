export interface UserDto {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  hasPassword: boolean;
  createdAt: string;
}

export interface SessionPayload {
  user: UserDto;
  accessTokenExpiresAt: string;
}
