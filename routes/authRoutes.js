const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyAuthInitiation, verifyAuthCallback } = require('../middleware/verifyOAuth');
const { authRateLimiter } = require('../middleware/rateLimiter');


// OAuth initiation
router.get('/', authRateLimiter, verifyAuthInitiation, authController.initiateAuth);
router.get('/auth', authRateLimiter, verifyAuthInitiation, authController.initiateAuth);

// OAuth callback
router.get('/auth/callback', authRateLimiter, verifyAuthCallback, authController.handleCallback);

// Installation check
router.get('/auth/status', authController.getAuthStatus);

module.exports = router;

