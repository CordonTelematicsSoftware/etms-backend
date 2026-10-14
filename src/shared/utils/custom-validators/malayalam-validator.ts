import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsMalayalamConstraint implements ValidatorConstraintInterface {
  validate(text: string): boolean {
    // Unicode range for Malayalam: 0D00–0D7F
    const malayalamRegex = /^[\u0D00-\u0D7F\s]+$/;
    return malayalamRegex.test(text);
  }

  defaultMessage(): string {
    return 'The text must be in Malayalam';
  }
}

export function IsMalayalam(validationOptions?: ValidationOptions) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsMalayalamConstraint,
    });
  };
}
