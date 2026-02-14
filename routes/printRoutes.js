const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const pdfParse = require('pdf-parse');

const { protect } = require('../middleware/authMiddleware');
const PrintRequest = require('../models/PrintRequest');


// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});


// Multer config (store temp file)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });



// ================================
// Upload PDF
// ================================
router.post('/upload', protect, upload.single('pdf'), async (req, res) => {

    let filePath = '';

    try {

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No PDF uploaded'
            });
        }

        filePath = req.file.path;


        // ====================
        // Calculate pages
        // ====================
        const buffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(buffer);

        const pages = pdfData.numpages;


        // ====================
        // Upload to Cloudinary
        // ====================
        const cloudResult = await cloudinary.uploader.upload(filePath, {
            folder: 'campusprint',
            resource_type: 'raw'
        });


        const copies = parseInt(req.body.copies) || 1;
        const pricePerPage = 1;
        const totalCost = pages * copies * pricePerPage;


        // ====================
        // Save in MongoDB
        // ====================
        const printRequest = await PrintRequest.create({

            userId: req.user._id,

            pdfUrl: cloudResult.secure_url,

            fileName: req.file.originalname,

            pages: pages,

            copies: copies,

            totalCost: totalCost,

            paymentStatus: 'pending',

            createdAt: new Date()

        });


        // ====================
        // Delete temp file
        // ====================
        fs.unlinkSync(filePath);


        // ====================
        // Response
        // ====================
        res.status(201).json({

            success: true,

            message: 'PDF uploaded successfully',

            data: printRequest

        });


    } catch (error) {

        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        console.error(error);

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

});



// ================================
// MOCK PAYMENT
// ================================
router.post('/pay', protect, async (req, res) => {

    try {

        const { printRequestId } = req.body;

        const request = await PrintRequest.findById(printRequestId);

        if (!request) {

            return res.status(404).json({

                success: false,
                message: 'Print request not found'

            });

        }


        if (request.paymentStatus === 'paid') {

            return res.status(400).json({

                success: false,
                message: 'Already paid'

            });

        }


        const printCode = Math.floor(1000 + Math.random() * 9000).toString();


        request.paymentStatus = 'paid';

        request.printCode = printCode;

        await request.save();


        res.json({

            success: true,

            message: 'Payment successful',

            printCode: printCode,

            data: request

        });

    }

    catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,
            message: error.message

        });

    }

});


module.exports = router;
