'use strict';

/**
 * Tiny zod → express validator. Saves repeating the if/else 400 shape in
 * every route. Use as:
 *
 *   const { z } = require('zod');
 *   const { validate } = require('../middleware/validate');
 *   router.post('/login', validate({ body: z.object({ email: z.string().email(), password: z.string().min(8) }) }), handler);
 */

function validate(schemas) {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        const parsed = schemas.body.parse(req.body);
        req.body = parsed;
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        // Express's req.query is read-only in v5+, so attach validated copy.
        req.validatedQuery = parsed;
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
