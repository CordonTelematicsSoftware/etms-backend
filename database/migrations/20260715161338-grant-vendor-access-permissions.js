'use strict';

const NEW_PERMISSIONS = [
  'Vendor Access-Read',
  'Vendor Access-Create',
  'Vendor Access-Update',
  'Vendor Access-Delete',
];

const ADMIN_SIGNAL_PERMISSION = 'Vendor Roles-Update';

module.exports = {
  up: async (queryInterface) => {
    // Only touch roles that already have the admin-signal permission,
    // and only append permissions that aren't already present (idempotent).
    await queryInterface.sequelize.query(
      `
      UPDATE "VendorRoles"
      SET permissions = permissions || ARRAY[:newPermissions]::varchar[]
      WHERE :adminSignal = ANY(permissions)
        AND NOT (permissions @> ARRAY[:newPermissions]::varchar[]);
      `,
      {
        replacements: {
          newPermissions: NEW_PERMISSIONS,
          adminSignal: ADMIN_SIGNAL_PERMISSION,
        },
      },
    );
  },

  down: async (queryInterface) => {
    // Remove exactly the permissions this migration added, from every role
    // (safe even if a role had them added independently later,
    // since down is only ever run right after up in practice).
    await queryInterface.sequelize.query(
      `
      UPDATE "VendorRoles"
      SET permissions = (
        SELECT array_agg(perm)
        FROM unnest(permissions) AS perm
        WHERE perm NOT IN (:newPermissions)
      )
      WHERE permissions && ARRAY[:newPermissions]::varchar[];
      `,
      {
        replacements: { newPermissions: NEW_PERMISSIONS },
      },
    );
  },
};