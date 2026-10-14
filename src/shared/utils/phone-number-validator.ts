/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';
import * as libphonenumber from 'libphonenumber-js';

@ValidatorConstraint({ async: false })
export class IsPhoneNumberWithCountryCodeConstraint
  implements ValidatorConstraintInterface
{
  validate(value: any, args: ValidationArguments) {
    // Implement your validation logic here
    const phoneNumber: any = libphonenumber.parsePhoneNumber(value);

    return phoneNumber.isValid();
  }

  defaultMessage(args: ValidationArguments) {
    return 'Invalid phone number with country code';
  }
}

export function IsPhoneNumberWithCountryCode(
  validationOptions?: ValidationOptions,
) {
  return function (object: Record<string, any>, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPhoneNumberWithCountryCodeConstraint,
    });
  };
}
