const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { protect } = require('../middleware/authMiddleware');
const PrintRequest = require('../models/PrintRequest');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer
const storage = multer.diskStorage({});
const upload = multer({ storage });

const fs = require('fs');
const pdfParse = require('pdf-parse/lib/pdf-parse');


// @desc    Upload PDF and create print request
// @route   POST /api/print/upload
// @access  Private
router.post('/upload', protect, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Calculate pages using pdf-parse
        const dataBuffer = fs.readFileSync(req.file.path);
        const data = await pdfParse(dataBuffer);
        const pages = data.numpages;

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'print_requests',
            resource_type: 'auto',
        });

        const copies = req.body.copies || 1;
        const totalCost = pages * copies * 5; // 5 INR per page

        const printRequest = await PrintRequest.create({
            userId: req.user._id,
            pdfUrl: result.secure_url,
            fileName: req.file.originalname,
            pages: pages,
            copies: copies,
            totalCost: totalCost,
            paymentStatus: 'pending',
        });

        res.status(201).json(printRequest);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @desc    Mock Payment
// @route   POST /api/print/pay
// @access  Private
router.post('/pay', protect, async (req, res) => {
    const { printRequestId } = req.body;

    try {
        const printRequest = await PrintRequest.findById(printRequestId);

        if (!printRequest) {
            return res.status(404).json({ message: 'Print request not found' });
        }

        if (printRequest.paymentStatus === 'paid') {
            return res.status(400).json({ message: 'Already paid' });
        }

        // Generate 4-digit print code
        const printCode = Math.floor(1000 + Math.random() * 9000).toString();

        printRequest.paymentStatus = 'paid';
        printRequest.printCode = printCode;
        await printRequest.save();

        res.json({
            message: 'Payment successful',
            printCode: printCode,
            printRequest,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

