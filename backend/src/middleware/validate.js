'use strict';

// Zod → Express validator. Pass { body, query, params } schemas; validated
// values replace req.body / req.validatedQuery / req.validatedParams.

function validate(schemas) {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        const parsed = schemas.body.parse(req.body);
        req.body = parsed;
      }
      if (schemas.query) {
        req.validatedQuery = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        req.validatedParams = parsed;
      }
      return next();
    } catch (err) {
      const issues = err?.issues?.map(i => ({
        path:    i.path.join('.'),
        message: i.message,
      })) ?? [{ message: err.message || 'Invalid request' }];
      return res.status(400).json({
        error: {
          code:      'VALIDATION_ERROR',
          message:   issues[0].message,
          issues,
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

module.exports = { validate };
