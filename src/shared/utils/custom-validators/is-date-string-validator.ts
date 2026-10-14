import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsDateStringAllowNull(
  allowNull: boolean,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDateStringAllowNull',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [allowNull],
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [allowNull] = args.constraints;
          if (
            allowNull &&
            (value === null || value === undefined || value === '')
          ) {
            return true;
          }
          const date = Date.parse(value);
          return !isNaN(date);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid date string or null`;
        },
      },
    });
  };
}
