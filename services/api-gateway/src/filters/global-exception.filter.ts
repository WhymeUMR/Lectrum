import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      return response.status(status).json({
        statusCode: status,
        ...(typeof res === 'object' && res !== null ? res : { message: res })
      });
    }

    if (this.isPayloadTooLarge(exception)) {
      return response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'Payload too large'
      });
    }

    console.error('Unhandled Exception:', exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error'
    });
  }

  private isPayloadTooLarge(exception: unknown): boolean {
    if (!exception || typeof exception !== 'object') {
      return false;
    }
    const candidate = exception as { type?: string; name?: string; code?: string };
    return (
      candidate.type === 'entity.too.large' ||
      candidate.name === 'PayloadTooLargeError' ||
      candidate.code === 'LIMIT_FILE_SIZE'
    );
  }
}
