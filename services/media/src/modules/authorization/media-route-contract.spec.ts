import { IS_PUBLIC_KEY, PERMISSIONS_KEY, PERMISSIONS_MODE_KEY } from '@patina/auth';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { AssetsController } from '../assets/assets.controller';
import { BackgroundRemovalController } from '../background-removal/background-removal.controller';
import { JobsController } from '../jobs/jobs.controller';
import { MediaController } from '../media/media.controller';
import { SearchController } from '../search/search.controller';
import { UploadController } from '../upload/upload.controller';
import { SystemController } from '../../system.controller';

const CANONICAL_MEDIA_PERMISSIONS = new Set([
  'media.read.own',
  'media.manage.own',
  'media.read.org',
  'media.manage.org',
  'media.admin.all',
]);

const REGISTERED_CONTROLLERS = [
  MediaController,
  AssetsController,
  UploadController,
  JobsController,
  SearchController,
  BackgroundRemovalController,
  SystemController,
];

describe('media route authorization contract', () => {
  it('requires canonical admin permission for job, search/report, and version surfaces', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, JobsController)).toEqual(['media.admin.all']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, SearchController)).toEqual(['media.admin.all']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, SystemController.prototype.version)).toEqual([
      'media.admin.all',
    ]);
  });

  it('uses any-of scoped read/manage permissions and admin-only CDN purge', () => {
    expect(Reflect.getMetadata(PERMISSIONS_MODE_KEY, AssetsController.prototype.getAsset)).toBe(
      'any',
    );
    expect(
      Reflect.getMetadata(PERMISSIONS_MODE_KEY, AssetsController.prototype.bulkUpdateAssets),
    ).toBe('any');
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AssetsController.prototype.purgeCdn)).toEqual([
      'media.admin.all',
    ]);
  });

  it('gives every registered Nest route canonical permission metadata and no public bypass', () => {
    const checkedRoutes: string[] = [];

    for (const controller of REGISTERED_CONTROLLERS) {
      const classPermissions = Reflect.getMetadata(PERMISSIONS_KEY, controller) as
        | string[]
        | undefined;
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller)).not.toBe(true);

      for (const methodName of Object.getOwnPropertyNames(controller.prototype)) {
        if (methodName === 'constructor') continue;
        const handler = (controller.prototype as unknown as Record<string, unknown>)[methodName];
        if (
          typeof handler !== 'function' ||
          Reflect.getMetadata(METHOD_METADATA, handler) === undefined
        ) {
          continue;
        }

        const permissions = (Reflect.getMetadata(PERMISSIONS_KEY, handler) ?? classPermissions) as
          | string[]
          | undefined;
        expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).not.toBe(true);
        expect(permissions?.length).toBeGreaterThan(0);
        expect(
          permissions?.every((permission) => CANONICAL_MEDIA_PERMISSIONS.has(permission)),
        ).toBe(true);
        checkedRoutes.push(`${controller.name}.${methodName}`);
      }
    }

    expect(checkedRoutes.length).toBeGreaterThan(0);
  });
});
