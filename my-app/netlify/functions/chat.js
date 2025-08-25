// Netlify Function for handling chat requests with enhanced error handling
const { processWildFireGPTChat } = require('../../lib/ai/smesh-llm');

// Environment variables
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
const FUNCTION_TIMEOUT = 55 * 1000; // 55 seconds (leaving 5s for Netlify)
const MAX_REQUEST_SIZE = 5 * 1024 * 1024; // 5MB max request size

// Logging helper
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => DEBUG_MODE && console.log('[DEBUG]', ...args)
};

// Error response helper
const errorResponse = (statusCode, message, details = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    success: false,
    error: message,
    ...details
  })
});

// Enhanced timeout handler with cleanup and cancellation support
const withTimeout = (promise, operation = 'operation', timeoutMs = FUNCTION_TIMEOUT) => {
  let timeoutId;
  let cancel;
  
  // Create a promise that rejects after the timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`Operation "${operation}" timed out after ${timeoutMs}ms`);
      error.code = 'ETIMEDOUT';
      reject(error);
    }, timeoutMs);
  });

  // Create a cancellation token
  const cancellation = new Promise((_, reject) => {
    cancel = (reason = 'Operation cancelled') => {
      const error = new Error(reason);
      error.code = 'ECANCELLED';
      reject(error);
    };
  });

  // Cleanup function
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
  };

  // Return an object with the race result and cancellation method
  return {
    result: Promise.race([
      Promise.resolve(promise).finally(cleanup),
      timeoutPromise,
      cancellation
    ]),
    cancel
  };
};

// Main handler function with proper timeout and error handling
exports.handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId || `req_${Math.random().toString(36).substr(2, 9)}`;
  
  // Log request
  logger.info(`[${requestId}] Processing request`);
  logger.debug(`[${requestId}] Headers:`, event.headers);
  
  try {
    // Validate request method
    if (event.httpMethod !== 'POST') {
      logger.error(`[${requestId}] Invalid method: ${event.httpMethod}`);
      return errorResponse(405, 'Method Not Allowed', { allowedMethods: ['POST'] });
    }
    
    // Check content type
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.includes('application/json')) {
      logger.error(`[${requestId}] Invalid content type: ${contentType}`);
      return errorResponse(415, 'Unsupported Media Type', { supportedTypes: ['application/json'] });
    }
    
    // Check request size
    if (event.body && event.body.length > MAX_REQUEST_SIZE) {
      logger.error(`[${requestId}] Request too large: ${event.body.length} bytes`);
      return errorResponse(413, 'Request Entity Too Large', { 
        maxSize: `${MAX_REQUEST_SIZE / (1024 * 1024)}MB` 
      });
    }
    
    // Parse request body
    let body;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch (error) {
      logger.error(`[${requestId}] Invalid JSON: ${error.message}`);
      return errorResponse(400, 'Invalid JSON in request body');
    }
    
    // Validate required fields
    if (!body.message || typeof body.message !== 'string') {
      logger.error(`[${requestId}] Missing or invalid message field`);
      return errorResponse(400, 'Message is required and must be a string');
    }
    
    logger.info(`[${requestId}] Processing message: ${body.message.substring(0, 50)}...`);
    
        // Process the message with timeout and retry logic
    const MAX_RETRIES = 2;
    let lastError;
    let response;
    let processingTime;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { result, cancel } = withTimeout(
          processWildFireGPTChat(body.message, body.conversationHistory || []),
          'processWildFireGPTChat',
          FUNCTION_TIMEOUT - 5000 // Leave 5s for response serialization
        );
        
        // Set a cleanup handler
        const cleanup = () => cancel('Operation cancelled due to timeout');
        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
        
        try {
          response = await result;
          process.off('SIGTERM', cleanup);
          process.off('SIGINT', cleanup);
          processingTime = Date.now() - startTime;
          
          logger.info(`[${requestId}] Request completed in ${processingTime}ms`);
          
          return {
            statusCode: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify({
              success: true,
              message: response,
              processingTime,
              requestId,
              ...(process.env.NODE_ENV === 'development' && { 
                debug: { attempt }
              })
            })
          };
          
        } catch (err) {
          process.off('SIGTERM', cleanup);
          process.off('SIGINT', cleanup);
          throw err; // Re-throw to be caught by the outer catch
        }
        
      } catch (error) {
        lastError = error;
        logger.warn(`[${requestId}] Attempt ${attempt} failed:`, error.message);
        
        if (attempt >= MAX_RETRIES) {
          throw lastError || new Error('Failed to process request after multiple attempts');
        }
        
        // Exponential backoff
        const backoffTime = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
    
    // This should never be reached due to the throw in the catch block
    throw new Error('Unexpected error in request processing');
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`[${requestId}] Error after ${processingTime}ms:`, error);
    
    // Handle specific error types
    if (error.code === 'ETIMEDOUT') {
      return errorResponse(504, 'Request Timeout', {
        message: 'The server timed out while processing your request',
        requestId,
        processingTime
      });
    }
    
    if (error.code === 'ECANCELLED') {
      return errorResponse(499, 'Request Cancelled', {
        message: error.message || 'Operation was cancelled',
        requestId,
        processingTime
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return errorResponse(400, 'Validation Error', {
        message: error.message,
        details: error.details,
        requestId,
        processingTime
      });
    }
    
    // Handle specific error types
    if (error.code === 'ECONNREFUSED') {
      return errorResponse(503, 'Service Unavailable', {
        message: 'A required service is currently unavailable',
        requestId,
        processingTime,
        service: error.address ? `${error.address}:${error.port}` : 'unknown',
        ...(process.env.NODE_ENV === 'development' && { 
          details: error.message,
          stack: error.stack 
        })
      });
    }
    
    if (error.name === 'TimeoutError' || error.code === 'ETIMEDOUT') {
      return errorResponse(504, 'Gateway Timeout', {
        message: 'The server took too long to respond',
        requestId,
        processingTime,
        ...(process.env.NODE_ENV === 'development' && { 
          details: error.message,
          stack: error.stack 
        })
      });
    }
    
    // Default error response
    return errorResponse(500, 'Internal Server Error', {
      message: 'An unexpected error occurred',
      requestId,
      processingTime,
      ...(process.env.NODE_ENV === 'development' ? { 
        error: error.message, 
        stack: error.stack 
      } : {})
    });
  }
};
