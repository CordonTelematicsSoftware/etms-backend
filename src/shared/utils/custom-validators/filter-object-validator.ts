/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'filterObjectValidator', async: false })
export class FilterObjectValidator implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    try {
      // Implement your validation logic here
      const objectValue = JSON.parse(value);
      if (typeof objectValue === 'object') return true;
      else return false;
    } catch (error) {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    return 'Filter must be an object structure';
  }
}
