import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()',
    );
    next();
  }
}

// import { Injectable, NestMiddleware } from '@nestjs/common';
// import { Request, Response, NextFunction } from 'express';

// @Injectable()
// export class SecurityHeadersMiddleware implements NestMiddleware {
//   private getCSP(): string {
//     const isProduction = process.env.NODE_ENV === 'production';

//     const allowedOrigins = isProduction
//       ? [
//           'https://admin.smartrouter.in',
//           'https://vendor.smartrouter.in',
//           'https://api.smartrouter.in',
//         ]
//       : [
//           'https://admin-uat.smartrouter.in',
//           'https://vendor-uat.smartrouter.in',
//           'https://employee-uat.smartrouter.in',
//           'https://api-uat.smartrouter.in',
//           'http://localhost:3000',
//           'http://localhost:3001',
//         ];

//     return [
//       "default-src 'self'",
//       "script-src 'self'",
//       "style-src 'self'",
//       "img-src 'self' data:",
//       "font-src 'self'",
//       `connect-src 'self' ${allowedOrigins.join(' ')}`,
//       "object-src 'none'",
//       "base-uri 'self'",
//       "form-action 'self'",
//       "frame-ancestors 'none'",
//     ].join('; ');
//   }

//   use(req: Request, res: Response, next: NextFunction) {
//     res.setHeader('Content-Security-Policy', this.getCSP());
//     res.setHeader('X-Frame-Options', 'DENY');
//     res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
//     res.setHeader('X-Content-Type-Options', 'nosniff');
//     res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
//     res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
//     next();
//   }
// }
