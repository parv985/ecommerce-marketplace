import { SellerStatus } from "../../constants/sellerStatus.js";

export interface SellerRegistrationInput {
  name: string;
  email: string;
  password: string;

  businessName: string;

  gstin: string;
  pan: string;

  bankAccountHolderName: string;
  bankAccountNumber: string;
  ifscCode: string;

  addressLine1: string;
  addressLine2?: string;

  city: string;
  state: string;
  pincode: string;

  documents?: {
    type: string;
    url: string;
    publicId: string;
    fileName?: string;
    size?: number;
  }[];
}

export interface SellerRegistrationResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };

  seller: {
    id: string;
    businessName: string;
    gstin: string;
    pan: string;
    status: SellerStatus;
  };
}

export interface SellerProfileResponse {
  id: string;
  userId: string;
  businessName: string;
  phone?: string | null;
  gstin: string;
  pan: string;
  bankAccountHolderName: string;
  bankAccountNumber: string;
  ifscCode: string;
  address: {
    addressLine1: string;
    addressLine2?: string | undefined;
    city: string;
    state: string;
    pincode: string;
  };
  documents: {
    type: string;
    url: string;
    publicId: string;
    fileName?: string;
    size?: number;
  }[];
  status: SellerStatus;
  statusReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}