import bcrypt from "bcryptjs";

import {
    UserRole,
} from "../../constants/roles.js";

import {
    SellerStatus,
} from "../../constants/sellerStatus.js";

import {
    sellerRegistrationSchema,
    updateSellerProfileSchema,
} from "./seller.schema.js";

import {
    findUserByEmail,
    findSellerByGstin,
    findSellerByPan,
    findSellerByUserId,
    createSellerUser,
    createSellerProfile,
    deleteUserById,
    updateSellerProfileById,
} from "./seller.repository.js";

import type {
    SellerProfileResponse,
    SellerRegistrationResponse,
} from "./seller.types.js";

import type { ISeller } from "../../models/Seller.js";

import { AppError } from "../../errors/AppError.js";


export const registerSeller = async (
    input: unknown,
): Promise<SellerRegistrationResponse> => {

    const data =
        sellerRegistrationSchema.parse(
            input,
        );


    /*
     * Check whether the email is already
     * associated with an existing account.
     */
    const existingUser =
        await findUserByEmail(
            data.email,
        );

    if (existingUser) {
        throw new AppError(
            "An account with this email already exists",
            409,
            "EMAIL_ALREADY_EXISTS",
        );
    }


    /*
     * GSTIN must be unique across sellers.
     */
    const existingGstin =
        await findSellerByGstin(
            data.gstin,
        );

    if (existingGstin) {
        throw new AppError(
            "A seller with this GSTIN already exists",
            409,
            "GSTIN_ALREADY_EXISTS",
        );
    }


    /*
     * PAN must be unique across sellers.
     */
    const existingPan =
        await findSellerByPan(
            data.pan,
        );

    if (existingPan) {
        throw new AppError(
            "A seller with this PAN already exists",
            409,
            "PAN_ALREADY_EXISTS",
        );
    }


    /*
     * Hash the seller's password before
     * storing the User document.
     */
    const passwordHash =
        await bcrypt.hash(
            data.password,
            10,
        );


    let user;

    try {

        user =
            await createSellerUser({
                name: data.name,
                email: data.email,
                passwordHash,
            });


        /*
         * A newly registered seller always starts
         * in PENDING status.
         *
         * Admin approval will be implemented later.
         */
        const seller =
            await createSellerProfile({
                userId: user._id,

                businessName:
                    data.businessName,

                gstin:
                    data.gstin,

                pan:
                    data.pan,

                bankAccountHolderName:
                    data.bankAccountHolderName,

                bankAccountNumber:
                    data.bankAccountNumber,

                ifscCode:
                    data.ifscCode,

                addressLine1:
                    data.addressLine1,

                addressLine2:
                    data.addressLine2 ?? "",

                city:
                    data.city,

                state:
                    data.state,

                pincode:
                    data.pincode,

                documents:
                    data.documents ?? [],

                status:
                    SellerStatus.PENDING,

                statusReason:
                    null,
            });


        return {
            user: {
                id:
                    user._id.toString(),

                name:
                    user.name,

                email:
                    user.email,

                role:
                    user.role,
            },

            seller: {
                id:
                    seller.userId.toString(),

                businessName:
                    seller.businessName,

                gstin:
                    seller.gstin,

                pan:
                    seller.pan,

                status:
                    seller.status,
            },
        };

    } catch (error) {

        /*
         * If Seller creation fails after User creation,
         * remove the User so we don't leave an orphan account.
         */
        if (user?._id) {
            await deleteUserById(
                user._id.toString(),
            );
        }

        throw error;
    }
};

const toSellerProfileResponse = (
    seller: ISeller,
): SellerProfileResponse => {
    return {
        id: seller._id.toString(),
        userId: seller.userId.toString(),
        businessName: seller.businessName,
        phone: seller.phone ?? null,
        gstin: seller.gstin,
        pan: seller.pan,
        bankAccountHolderName:
            seller.bankAccountHolderName,
        bankAccountNumber:
            seller.bankAccountNumber,
        ifscCode: seller.ifscCode,
        address: {
            addressLine1:
                seller.addressLine1,
            addressLine2:
                seller.addressLine2,
            city: seller.city,
            state: seller.state,
            pincode: seller.pincode,
        },
        documents: seller.documents ?? [],
        status: seller.status,
        statusReason:
            seller.statusReason ?? null,
        createdAt: seller.createdAt,
        updatedAt: seller.updatedAt,
    };
};

export const getSellerProfile = async (
    userId: string,
): Promise<SellerProfileResponse> => {
    const seller = await findSellerByUserId(
        userId,
    );

    if (!seller) {
        throw new AppError(
            "Seller profile not found",
            404,
            "SELLER_NOT_FOUND",
        );
    }

    return toSellerProfileResponse(seller);
};

export const updateSellerProfile = async (
    userId: string,
    input: unknown,
): Promise<SellerProfileResponse> => {
    const data =
        updateSellerProfileSchema.parse(
            input,
        );

    const seller = await findSellerByUserId(
        userId,
    );

    if (!seller) {
        throw new AppError(
            "Seller profile not found",
            404,
            "SELLER_NOT_FOUND",
        );
    }

    const updated =
        await updateSellerProfileById(
            seller._id.toString(),
            data,
        );

    if (!updated) {
        throw new AppError(
            "Seller profile not found",
            404,
            "SELLER_NOT_FOUND",
        );
    }

    return toSellerProfileResponse(updated);
};
