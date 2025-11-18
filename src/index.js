const express = require('express');
require('dotenv').config();
const app = express();
const paymentInstructionsRouter = require('./routes/paymentRoutes');


app.use(express.json());

app.use('/payment-instructions', paymentInstructionsRouter);

app.get('/', (req, res) => {
  res.json({ 
    message: 'Payment Instruction Parser API',
    version: '1.0.0',
    endpoints: {
      'POST /payment-instructions': 'Process payment instruction'
    }
  });
});


app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist'
  });
});


app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    type: null,
    amount: null,
    currency: null,
    debit_account: null,
    credit_account: null,
    execute_by: null,
    status: 'failed',
    status_reason: 'Internal server error',
    status_code: 'SY03',
    accounts: []
  });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Endpoint: POST /payment-instructions`);
});