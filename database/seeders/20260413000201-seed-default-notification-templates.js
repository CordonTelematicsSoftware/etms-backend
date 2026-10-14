'use strict';

const templates = [
  {
    code: 'account_creation_email_en',
    name: 'Account Creation Email',
    event: 'account.creation',
    channel: 'email',
    subject: 'Welcome, {{recipient.firstName}}',
    body: '<p>Hello {{recipient.firstName}},</p><p>Your account has been created for {{data.organizationName}}.</p>',
    variables: {
      recipient: ['firstName', 'email'],
      data: ['organizationName'],
    },
  },
  {
    code: 'account_creation_sms_en',
    name: 'Account Creation SMS',
    event: 'account.creation',
    channel: 'sms',
    subject: null,
    body: 'Hello {{recipient.firstName}}, your account for {{recipient.organizationName}} has been created.',
    variables: {
      recipient: ['firstName', 'phoneNumber'],
      data: ['organizationName'],
    },
  },
  {
    code: 'account_creation_push_en',
    name: 'Account Creation Push',
    event: 'account.creation',
    channel: 'push',
    subject: 'Account created',
    body: 'Welcome {{recipient.firstName}}. Your account is ready.',
    variables: {
      recipient: ['firstName', 'deviceToken'],
      data: ['organizationName'],
    },
  },
  {
    code: 'password_reset_email_en',
    name: 'Password Reset Email',
    event: 'password.reset',
    channel: 'email',
    subject: 'Reset your password',
    body: '<p>Hello {{recipient.firstName}},</p><p>Use this link to reset your password: {{data.resetUrl}}</p>',
    variables: {
      recipient: ['firstName', 'email'],
      data: ['resetUrl'],
    },
  },
  {
    code: 'password_reset_sms_en',
    name: 'Password Reset SMS',
    event: 'password.reset',
    channel: 'sms',
    subject: null,
    body: 'Your password reset code is {{data.otp}}. It expires in {{data.expiresInMinutes}} minutes.',
    variables: {
      data: ['otp', 'expiresInMinutes'],
    },
  },
  {
    code: 'password_reset_push_en',
    name: 'Password Reset Push',
    event: 'password.reset',
    channel: 'push',
    subject: 'Password reset',
    body: 'A password reset was requested for your account.',
    variables: {
      recipient: ['deviceToken'],
    },
  },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const data = templates.map((template) => ({
      code: template.code,
      name: template.name,
      event: template.event,
      channel: template.channel,
      locale: 'en',
      subject: template.subject,
      body: template.body,
      variables: JSON.stringify(template.variables), 
      metadata: JSON.stringify({}), 
      isActive: true,
      createdBy: 'system', // should be SuperAdmin
      updatedBy: 'system', // should be SuperAdmin
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await queryInterface.bulkInsert('NotificationTemplates', data, {
      ignoreDuplicates: true,
    });
  },

  async down(queryInterface) {
    const codes = templates.map((t) => t.code);

    await queryInterface.bulkDelete('NotificationTemplates', {
      code: codes,
    });
  },
};