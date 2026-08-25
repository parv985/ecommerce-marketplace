import type { UserRole } from "../../constants/roles.js";

export interface UserProfileResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
  isEmailVerified: boolean;
  createdAt: Date;
}

export interface AddressResponse {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  createdAt: Date;
  updatedAt: Date;
}
