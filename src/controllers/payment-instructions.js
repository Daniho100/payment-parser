function processPaymentInstruction(req, res) {
  const { accounts, instruction } = req.body;

  const response = {
    type: null,
    amount: null,
    currency: null,
    debit_account: null,
    credit_account: null,
    execute_by: null,
    status: 'failed',
    status_reason: '',
    status_code: '',
    accounts: []
  };

  try {
    const parsed = parseInstruction(instruction);
    
    Object.assign(response, parsed);

    if (parsed.status === 'failed') {
      return res.status(400).json(response);
    }

    const validated = validateAndExecute(parsed, accounts);
    Object.assign(response, validated);

    const httpStatus = response.status === 'failed' ? 400 : 200;
    return res.status(httpStatus).json(response);

  } catch (error) {
    response.status = 'failed';
    response.status_reason = 'Malformed instruction: unable to parse';
    response.status_code = 'SY03';
    return res.status(400).json(response);
  }
}

function parseInstruction(instruction) {
  const result = {
    type: null,
    amount: null,
    currency: null,
    debit_account: null,
    credit_account: null,
    execute_by: null,
    status: 'failed',
    status_reason: '',
    status_code: ''
  };

  if (!instruction || typeof instruction !== 'string') {
    result.status_reason = 'Malformed instruction: unable to parse';
    result.status_code = 'SY03';
    return result;
  }

  const normalized = instruction.trim();
  let cleaned = '';
  let prevSpace = false;
  
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      if (!prevSpace) {
        cleaned += ' ';
        prevSpace = true;
      }
    } else {
      cleaned += char;
      prevSpace = false;
    }
  }
  
  const words = cleaned.split(' ');
  const upperInstruction = cleaned.toUpperCase();

  const firstWord = words[0].toUpperCase();
  
  if (firstWord !== 'DEBIT' && firstWord !== 'CREDIT') {
    result.status_reason = 'Missing required keyword: DEBIT or CREDIT';
    result.status_code = 'SY01';
    return result;
  }

  result.type = firstWord;

  if (words.length < 2) {
    result.status_reason = 'Missing amount';
    result.status_code = 'SY03';
    return result;
  }

  const amountStr = words[1];
  if (amountStr.indexOf('.') !== -1) {
    result.status_reason = 'Amount must be a positive integer';
    result.status_code = 'AM01';
    return result;
  }

  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount <= 0) {
    result.status_reason = 'Amount must be a positive integer';
    result.status_code = 'AM01';
    return result;
  }
  result.amount = amount;

  if (words.length < 3) {
    result.status_reason = 'Missing currency';
    result.status_code = 'SY03';
    return result;
  }
  result.currency = words[2].toUpperCase();

  const fromPos = findKeyword(upperInstruction, ' FROM ');
  const toPos = findKeyword(upperInstruction, ' TO ');
  const forPos = findKeyword(upperInstruction, ' FOR ');
  const onPos = findKeyword(upperInstruction, ' ON ');

  if (firstWord === 'DEBIT') {
    
    if (fromPos === -1) {
      result.status_reason = 'Missing required keyword: FROM';
      result.status_code = 'SY01';
      return result;
    }

    const forCreditToPos = findKeyword(upperInstruction, ' FOR CREDIT TO ');
    if (forCreditToPos === -1) {
      result.status_reason = 'Missing required keyword sequence: FOR CREDIT TO';
      result.status_code = 'SY01';
      return result;
    }

    if (fromPos >= forCreditToPos) {
      result.status_reason = 'Invalid keyword order';
      result.status_code = 'SY02';
      return result;
    }

    const debitStart = fromPos + 6;
    const debitSection = cleaned.substring(debitStart, forPos).trim();
    const debitAccount = extractAccountId(debitSection);
    
    if (!debitAccount) {
      result.status_reason = 'Missing or invalid debit account';
      result.status_code = 'SY03';
      return result;
    }
    result.debit_account = debitAccount;

    const creditStart = forCreditToPos + 15;
    let creditSection;
    
    if (onPos !== -1 && onPos > creditStart) {
      creditSection = cleaned.substring(creditStart, onPos).trim();
    } else {
      creditSection = cleaned.substring(creditStart).trim();
    }
    
    const creditAccount = extractAccountId(creditSection);
    
    if (!creditAccount) {
      result.status_reason = 'Missing or invalid credit account';
      result.status_code = 'SY03';
      return result;
    }
    result.credit_account = creditAccount;

  } else if (firstWord === 'CREDIT') {
    
    if (toPos === -1) {
      result.status_reason = 'Missing required keyword: TO';
      result.status_code = 'SY01';
      return result;
    }

    const forDebitFromPos = findKeyword(upperInstruction, ' FOR DEBIT FROM ');
    if (forDebitFromPos === -1) {
      result.status_reason = 'Missing required keyword sequence: FOR DEBIT FROM';
      result.status_code = 'SY01';
      return result;
    }

    if (toPos >= forDebitFromPos) {
      result.status_reason = 'Invalid keyword order';
      result.status_code = 'SY02';
      return result;
    }

    const creditStart = toPos + 4;
    const creditSection = cleaned.substring(creditStart, forPos).trim();
    const creditAccount = extractAccountId(creditSection);
    
    if (!creditAccount) {
      result.status_reason = 'Missing or invalid credit account';
      result.status_code = 'SY03';
      return result;
    }
    result.credit_account = creditAccount;

    const debitStart = forDebitFromPos + 16;
    let debitSection;
    
    if (onPos !== -1 && onPos > debitStart) {
      debitSection = cleaned.substring(debitStart, onPos).trim();
    } else {
      debitSection = cleaned.substring(debitStart).trim();
    }
    
    const debitAccount = extractAccountId(debitSection);
    
    if (!debitAccount) {
      result.status_reason = 'Missing or invalid debit account';
      result.status_code = 'SY03';
      return result;
    }
    result.debit_account = debitAccount;
  }

  if (!isValidAccountId(result.debit_account)) {
    result.status_reason = 'Invalid debit account ID format';
    result.status_code = 'AC04';
    return result;
  }
  
  if (!isValidAccountId(result.credit_account)) {
    result.status_reason = 'Invalid credit account ID format';
    result.status_code = 'AC04';
    return result;
  }

  if (onPos !== -1) {
    const dateStr = cleaned.substring(onPos + 4).trim();
    result.execute_by = dateStr;
    
    if (!isValidDate(dateStr)) {
      result.status_reason = 'Invalid date format. Expected YYYY-MM-DD';
      result.status_code = 'DT01';
      return result;
    }
  }

  result.status = 'successful';
  result.status_code = 'AP00';
  return result;
}

function findKeyword(str, keyword) {
  return str.indexOf(keyword);
}

function extractAccountId(section) {
  const upper = section.toUpperCase();
  const accountPos = upper.indexOf('ACCOUNT');
  
  if (accountPos === -1) {
    return null;
  }
  
  const afterAccount = section.substring(accountPos + 7).trim();
  const words = afterAccount.split(' ');
  return words[0] || null;
}

function isValidAccountId(accountId) {
  if (!accountId) return false;
  
  for (let i = 0; i < accountId.length; i++) {
    const char = accountId[i];
    const isAlphaNumeric = (char >= 'a' && char <= 'z') || 
                           (char >= 'A' && char <= 'Z') || 
                           (char >= '0' && char <= '9');
    const isSpecial = char === '-' || char === '.' || char === '@';
    
    if (!isAlphaNumeric && !isSpecial) {
      return false;
    }
  }
  
  return true;
}

function isValidDate(dateStr) {
  if (!dateStr || dateStr.length !== 10) return false;
  
  if (dateStr[4] !== '-' || dateStr[7] !== '-') return false;
  
  for (let i = 0; i < dateStr.length; i++) {
    if (i === 4 || i === 7) continue;
    if (dateStr[i] < '0' || dateStr[i] > '9') return false;
  }
  
  return true;
}

function validateAndExecute(parsed, accounts) {
  const response = { ...parsed };
  const supportedCurrencies = ['NGN', 'USD', 'GBP', 'GHS'];

  if (supportedCurrencies.indexOf(parsed.currency) === -1) {
    response.status = 'failed';
    response.status_reason = 'Unsupported currency. Only NGN, USD, GBP, and GHS are supported';
    response.status_code = 'CU02';
    response.accounts = createAccountsResponse(accounts, parsed.debit_account, parsed.credit_account, false);
    return response;
  }

  const debitAcc = accounts.find(acc => acc.id === parsed.debit_account);
  const creditAcc = accounts.find(acc => acc.id === parsed.credit_account);

  if (!debitAcc) {
    response.status = 'failed';
    response.status_reason = `Account not found: ${parsed.debit_account}`;
    response.status_code = 'AC03';
    response.accounts = createAccountsResponse(accounts, parsed.debit_account, parsed.credit_account, false);
    return response;
  }

  if (!creditAcc) {
    response.status = 'failed';
    response.status_reason = `Account not found: ${parsed.credit_account}`;
    response.status_code = 'AC03';
    response.accounts = createAccountsResponse(accounts, parsed.debit_account, parsed.credit_account, false);
    return response;
  }

  if (parsed.debit_account === parsed.credit_account) {
    response.status = 'failed';
    response.status_reason = 'Debit and credit accounts cannot be the same';
    response.status_code = 'AC02';
    response.accounts = createAccountsResponse(accounts, parsed.debit_account, parsed.credit_account, false);
    return response;
  }

  if (debitAcc.currency !== creditAcc.currency) {
    response.status = 'failed';
    response.status_reason = 'Account currency mismatch';
    response.status_code = 'CU01';
    response.accounts = createAccountsResponse(accounts, parsed.debit_account, parsed.credit_account, false);
    return response;
  }

  if (debitAcc.balance < parsed.amount) {
    response.status = 'failed';
    response.status_reason = 'Insufficient funds in debit account';
    response.status_code = 'AC01';
    response.accounts = createAccountsResponse(accounts, parsed.debit_account, parsed.credit_account, false);
    return response;
  }

  if (parsed.execute_by) {
    const executeDate = new Date(parsed.execute_by + 'T00:00:00Z');
    const currentDate = new Date();
    currentDate.setUTCHours(0, 0, 0, 0);

    if (executeDate > currentDate) {
      response.status = 'pending';
      response.status_reason = 'Transaction scheduled for future execution';
      response.status_code = 'AP02';
      response.accounts = createAccountsResponse(accounts, parsed.debit_account, parsed.credit_account, false);
      return response;
    }
  }

  response.status = 'successful';
  response.status_reason = 'Transaction executed successfully';
  response.status_code = 'AP00';
  response.accounts = createAccountsResponse(accounts, parsed.debit_account, parsed.credit_account, true, parsed.amount);
  
  return response;
}

function createAccountsResponse(accounts, debitId, creditId, executeTransaction, amount = 0) {
  const result = [];
  
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    
    if (acc.id === debitId || acc.id === creditId) {
      const accountCopy = {
        id: acc.id,
        balance: acc.balance,
        balance_before: acc.balance,
        currency: acc.currency.toUpperCase()
      };
      
      if (executeTransaction) {
        if (acc.id === debitId) {
          accountCopy.balance = acc.balance - amount;
        } else if (acc.id === creditId) {
          accountCopy.balance = acc.balance + amount;
        }
      }
      
      result.push(accountCopy);
    }
  }
  
  return result;
}

module.exports = { processPaymentInstruction };