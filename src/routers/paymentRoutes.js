const express = require('express');
const router = express.Router();
const { processPaymentInstruction } = require('../controllers/payment-instructions');

router.post('/', (req, res) => {
  processPaymentInstruction(req, res);
});

module.exports = router;