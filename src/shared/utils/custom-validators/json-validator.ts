/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  validate,
} from 'class-validator';
import { plainToClass } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';

export function JsonValidator(
  dtoClass: any,
  validationOptions?: ValidationOptions,
) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'JsonValidator',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        async validate(value: any, args: ValidationArguments): Promise<any> {
          // Transform the value into an instance of the target DTO class
          const validationObject = plainToClass(dtoClass, value);
          // Validate the transformed object using class-validator
          const errors = await validate(validationObject);
          if (errors?.length > 0) {
            // If there are errors, extract and format the error messages
            const errorMessages = errors.map((error) => {
              const constraints = error?.constraints;
              if (constraints) {
                const errorMessage = Object.values(constraints).join('; ');
                return `${errorMessage}`;
              } else {
                return `${error.property} has validation errors`;
              }
            });
            // Return formatted error messages
            throw new BadRequestException(errorMessages);
          }
          return true;
        },
      },
    });
  };
}
