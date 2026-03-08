
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model MediaAsset
 * 
 */
export type MediaAsset = $Result.DefaultSelection<Prisma.$MediaAssetPayload>
/**
 * Model AssetRendition
 * 
 */
export type AssetRendition = $Result.DefaultSelection<Prisma.$AssetRenditionPayload>
/**
 * Model ThreeDAsset
 * 
 */
export type ThreeDAsset = $Result.DefaultSelection<Prisma.$ThreeDAssetPayload>
/**
 * Model ProcessJob
 * 
 */
export type ProcessJob = $Result.DefaultSelection<Prisma.$ProcessJobPayload>
/**
 * Model UploadSession
 * 
 */
export type UploadSession = $Result.DefaultSelection<Prisma.$UploadSessionPayload>
/**
 * Model LicenseRecord
 * 
 */
export type LicenseRecord = $Result.DefaultSelection<Prisma.$LicenseRecordPayload>
/**
 * Model OutboxEvent
 * 
 */
export type OutboxEvent = $Result.DefaultSelection<Prisma.$OutboxEventPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const AssetKind: {
  IMAGE: 'IMAGE',
  MODEL3D: 'MODEL3D'
};

export type AssetKind = (typeof AssetKind)[keyof typeof AssetKind]


export const AssetRole: {
  HERO: 'HERO',
  ANGLE: 'ANGLE',
  LIFESTYLE: 'LIFESTYLE',
  DETAIL: 'DETAIL',
  AR_PREVIEW: 'AR_PREVIEW',
  TEXTURE: 'TEXTURE',
  OTHER: 'OTHER'
};

export type AssetRole = (typeof AssetRole)[keyof typeof AssetRole]


export const AssetStatus: {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
  QUARANTINED: 'QUARANTINED'
};

export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus]


export const ScanStatus: {
  PENDING: 'PENDING',
  SCANNING: 'SCANNING',
  CLEAN: 'CLEAN',
  INFECTED: 'INFECTED',
  ERROR: 'ERROR'
};

export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus]


export const RenditionFormat: {
  JPEG: 'JPEG',
  PNG: 'PNG',
  WEBP: 'WEBP',
  AVIF: 'AVIF'
};

export type RenditionFormat = (typeof RenditionFormat)[keyof typeof RenditionFormat]


export const RenditionPurpose: {
  THUMB: 'THUMB',
  WEB: 'WEB',
  RETINA: 'RETINA',
  PREVIEW: 'PREVIEW',
  ORIGINAL: 'ORIGINAL'
};

export type RenditionPurpose = (typeof RenditionPurpose)[keyof typeof RenditionPurpose]


export const JobType: {
  IMAGE_PROCESS: 'IMAGE_PROCESS',
  IMAGE_TRANSFORM: 'IMAGE_TRANSFORM',
  MODEL3D_CONVERT: 'MODEL3D_CONVERT',
  MODEL3D_OPTIMIZE: 'MODEL3D_OPTIMIZE',
  SNAPSHOT_GENERATE: 'SNAPSHOT_GENERATE',
  VIRUS_SCAN: 'VIRUS_SCAN',
  METADATA_EXTRACT: 'METADATA_EXTRACT',
  ASSET_DELETE: 'ASSET_DELETE',
  BULK_DELETE: 'BULK_DELETE',
  BULK_COPY: 'BULK_COPY',
  CLEANUP_ORPHANED: 'CLEANUP_ORPHANED'
};

export type JobType = (typeof JobType)[keyof typeof JobType]


export const JobState: {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  RETRY: 'RETRY',
  CANCELED: 'CANCELED'
};

export type JobState = (typeof JobState)[keyof typeof JobState]


export const UploadStatus: {
  PENDING: 'PENDING',
  UPLOADED: 'UPLOADED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED'
};

export type UploadStatus = (typeof UploadStatus)[keyof typeof UploadStatus]

}

export type AssetKind = $Enums.AssetKind

export const AssetKind: typeof $Enums.AssetKind

export type AssetRole = $Enums.AssetRole

export const AssetRole: typeof $Enums.AssetRole

export type AssetStatus = $Enums.AssetStatus

export const AssetStatus: typeof $Enums.AssetStatus

export type ScanStatus = $Enums.ScanStatus

export const ScanStatus: typeof $Enums.ScanStatus

export type RenditionFormat = $Enums.RenditionFormat

export const RenditionFormat: typeof $Enums.RenditionFormat

export type RenditionPurpose = $Enums.RenditionPurpose

export const RenditionPurpose: typeof $Enums.RenditionPurpose

export type JobType = $Enums.JobType

export const JobType: typeof $Enums.JobType

export type JobState = $Enums.JobState

export const JobState: typeof $Enums.JobState

export type UploadStatus = $Enums.UploadStatus

export const UploadStatus: typeof $Enums.UploadStatus

/**
 * ##  Prisma Client ʲˢ
 * 
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more MediaAssets
 * const mediaAssets = await prisma.mediaAsset.findMany()
 * ```
 *
 * 
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   * 
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more MediaAssets
   * const mediaAssets = await prisma.mediaAsset.findMany()
   * ```
   *
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs>

      /**
   * `prisma.mediaAsset`: Exposes CRUD operations for the **MediaAsset** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more MediaAssets
    * const mediaAssets = await prisma.mediaAsset.findMany()
    * ```
    */
  get mediaAsset(): Prisma.MediaAssetDelegate<ExtArgs>;

  /**
   * `prisma.assetRendition`: Exposes CRUD operations for the **AssetRendition** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AssetRenditions
    * const assetRenditions = await prisma.assetRendition.findMany()
    * ```
    */
  get assetRendition(): Prisma.AssetRenditionDelegate<ExtArgs>;

  /**
   * `prisma.threeDAsset`: Exposes CRUD operations for the **ThreeDAsset** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ThreeDAssets
    * const threeDAssets = await prisma.threeDAsset.findMany()
    * ```
    */
  get threeDAsset(): Prisma.ThreeDAssetDelegate<ExtArgs>;

  /**
   * `prisma.processJob`: Exposes CRUD operations for the **ProcessJob** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ProcessJobs
    * const processJobs = await prisma.processJob.findMany()
    * ```
    */
  get processJob(): Prisma.ProcessJobDelegate<ExtArgs>;

  /**
   * `prisma.uploadSession`: Exposes CRUD operations for the **UploadSession** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more UploadSessions
    * const uploadSessions = await prisma.uploadSession.findMany()
    * ```
    */
  get uploadSession(): Prisma.UploadSessionDelegate<ExtArgs>;

  /**
   * `prisma.licenseRecord`: Exposes CRUD operations for the **LicenseRecord** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more LicenseRecords
    * const licenseRecords = await prisma.licenseRecord.findMany()
    * ```
    */
  get licenseRecord(): Prisma.LicenseRecordDelegate<ExtArgs>;

  /**
   * `prisma.outboxEvent`: Exposes CRUD operations for the **OutboxEvent** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more OutboxEvents
    * const outboxEvents = await prisma.outboxEvent.findMany()
    * ```
    */
  get outboxEvent(): Prisma.OutboxEventDelegate<ExtArgs>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError
  export import NotFoundError = runtime.NotFoundError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics 
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 5.22.0
   * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    MediaAsset: 'MediaAsset',
    AssetRendition: 'AssetRendition',
    ThreeDAsset: 'ThreeDAsset',
    ProcessJob: 'ProcessJob',
    UploadSession: 'UploadSession',
    LicenseRecord: 'LicenseRecord',
    OutboxEvent: 'OutboxEvent'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "mediaAsset" | "assetRendition" | "threeDAsset" | "processJob" | "uploadSession" | "licenseRecord" | "outboxEvent"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      MediaAsset: {
        payload: Prisma.$MediaAssetPayload<ExtArgs>
        fields: Prisma.MediaAssetFieldRefs
        operations: {
          findUnique: {
            args: Prisma.MediaAssetFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MediaAssetPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.MediaAssetFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MediaAssetPayload>
          }
          findFirst: {
            args: Prisma.MediaAssetFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MediaAssetPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.MediaAssetFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MediaAssetPayload>
          }
          findMany: {
            args: Prisma.MediaAssetFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MediaAssetPayload>[]
          }
          create: {
            args: Prisma.MediaAssetCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MediaAssetPayload>
          }
          createMany: {
            args: Prisma.MediaAssetCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.MediaAssetCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MediaAssetPayload>[]
          }
          delete: {
            args: Prisma.MediaAssetDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MediaAssetPayload>
          }
          update: {
            args: Prisma.MediaAssetUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MediaAssetPayload>
          }
          deleteMany: {
            args: Prisma.MediaAssetDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.MediaAssetUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.MediaAssetUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MediaAssetPayload>
          }
          aggregate: {
            args: Prisma.MediaAssetAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateMediaAsset>
          }
          groupBy: {
            args: Prisma.MediaAssetGroupByArgs<ExtArgs>
            result: $Utils.Optional<MediaAssetGroupByOutputType>[]
          }
          count: {
            args: Prisma.MediaAssetCountArgs<ExtArgs>
            result: $Utils.Optional<MediaAssetCountAggregateOutputType> | number
          }
        }
      }
      AssetRendition: {
        payload: Prisma.$AssetRenditionPayload<ExtArgs>
        fields: Prisma.AssetRenditionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AssetRenditionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AssetRenditionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AssetRenditionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AssetRenditionPayload>
          }
          findFirst: {
            args: Prisma.AssetRenditionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AssetRenditionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AssetRenditionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AssetRenditionPayload>
          }
          findMany: {
            args: Prisma.AssetRenditionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AssetRenditionPayload>[]
          }
          create: {
            args: Prisma.AssetRenditionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AssetRenditionPayload>
          }
          createMany: {
            args: Prisma.AssetRenditionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AssetRenditionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AssetRenditionPayload>[]
          }
          delete: {
            args: Prisma.AssetRenditionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AssetRenditionPayload>
          }
          update: {
            args: Prisma.AssetRenditionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AssetRenditionPayload>
          }
          deleteMany: {
            args: Prisma.AssetRenditionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AssetRenditionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.AssetRenditionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AssetRenditionPayload>
          }
          aggregate: {
            args: Prisma.AssetRenditionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAssetRendition>
          }
          groupBy: {
            args: Prisma.AssetRenditionGroupByArgs<ExtArgs>
            result: $Utils.Optional<AssetRenditionGroupByOutputType>[]
          }
          count: {
            args: Prisma.AssetRenditionCountArgs<ExtArgs>
            result: $Utils.Optional<AssetRenditionCountAggregateOutputType> | number
          }
        }
      }
      ThreeDAsset: {
        payload: Prisma.$ThreeDAssetPayload<ExtArgs>
        fields: Prisma.ThreeDAssetFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ThreeDAssetFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreeDAssetPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ThreeDAssetFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreeDAssetPayload>
          }
          findFirst: {
            args: Prisma.ThreeDAssetFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreeDAssetPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ThreeDAssetFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreeDAssetPayload>
          }
          findMany: {
            args: Prisma.ThreeDAssetFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreeDAssetPayload>[]
          }
          create: {
            args: Prisma.ThreeDAssetCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreeDAssetPayload>
          }
          createMany: {
            args: Prisma.ThreeDAssetCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ThreeDAssetCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreeDAssetPayload>[]
          }
          delete: {
            args: Prisma.ThreeDAssetDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreeDAssetPayload>
          }
          update: {
            args: Prisma.ThreeDAssetUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreeDAssetPayload>
          }
          deleteMany: {
            args: Prisma.ThreeDAssetDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ThreeDAssetUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.ThreeDAssetUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ThreeDAssetPayload>
          }
          aggregate: {
            args: Prisma.ThreeDAssetAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateThreeDAsset>
          }
          groupBy: {
            args: Prisma.ThreeDAssetGroupByArgs<ExtArgs>
            result: $Utils.Optional<ThreeDAssetGroupByOutputType>[]
          }
          count: {
            args: Prisma.ThreeDAssetCountArgs<ExtArgs>
            result: $Utils.Optional<ThreeDAssetCountAggregateOutputType> | number
          }
        }
      }
      ProcessJob: {
        payload: Prisma.$ProcessJobPayload<ExtArgs>
        fields: Prisma.ProcessJobFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ProcessJobFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProcessJobPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ProcessJobFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProcessJobPayload>
          }
          findFirst: {
            args: Prisma.ProcessJobFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProcessJobPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ProcessJobFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProcessJobPayload>
          }
          findMany: {
            args: Prisma.ProcessJobFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProcessJobPayload>[]
          }
          create: {
            args: Prisma.ProcessJobCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProcessJobPayload>
          }
          createMany: {
            args: Prisma.ProcessJobCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ProcessJobCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProcessJobPayload>[]
          }
          delete: {
            args: Prisma.ProcessJobDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProcessJobPayload>
          }
          update: {
            args: Prisma.ProcessJobUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProcessJobPayload>
          }
          deleteMany: {
            args: Prisma.ProcessJobDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ProcessJobUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.ProcessJobUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ProcessJobPayload>
          }
          aggregate: {
            args: Prisma.ProcessJobAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateProcessJob>
          }
          groupBy: {
            args: Prisma.ProcessJobGroupByArgs<ExtArgs>
            result: $Utils.Optional<ProcessJobGroupByOutputType>[]
          }
          count: {
            args: Prisma.ProcessJobCountArgs<ExtArgs>
            result: $Utils.Optional<ProcessJobCountAggregateOutputType> | number
          }
        }
      }
      UploadSession: {
        payload: Prisma.$UploadSessionPayload<ExtArgs>
        fields: Prisma.UploadSessionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UploadSessionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UploadSessionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UploadSessionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UploadSessionPayload>
          }
          findFirst: {
            args: Prisma.UploadSessionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UploadSessionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UploadSessionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UploadSessionPayload>
          }
          findMany: {
            args: Prisma.UploadSessionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UploadSessionPayload>[]
          }
          create: {
            args: Prisma.UploadSessionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UploadSessionPayload>
          }
          createMany: {
            args: Prisma.UploadSessionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.UploadSessionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UploadSessionPayload>[]
          }
          delete: {
            args: Prisma.UploadSessionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UploadSessionPayload>
          }
          update: {
            args: Prisma.UploadSessionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UploadSessionPayload>
          }
          deleteMany: {
            args: Prisma.UploadSessionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UploadSessionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.UploadSessionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UploadSessionPayload>
          }
          aggregate: {
            args: Prisma.UploadSessionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUploadSession>
          }
          groupBy: {
            args: Prisma.UploadSessionGroupByArgs<ExtArgs>
            result: $Utils.Optional<UploadSessionGroupByOutputType>[]
          }
          count: {
            args: Prisma.UploadSessionCountArgs<ExtArgs>
            result: $Utils.Optional<UploadSessionCountAggregateOutputType> | number
          }
        }
      }
      LicenseRecord: {
        payload: Prisma.$LicenseRecordPayload<ExtArgs>
        fields: Prisma.LicenseRecordFieldRefs
        operations: {
          findUnique: {
            args: Prisma.LicenseRecordFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LicenseRecordPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.LicenseRecordFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LicenseRecordPayload>
          }
          findFirst: {
            args: Prisma.LicenseRecordFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LicenseRecordPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.LicenseRecordFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LicenseRecordPayload>
          }
          findMany: {
            args: Prisma.LicenseRecordFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LicenseRecordPayload>[]
          }
          create: {
            args: Prisma.LicenseRecordCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LicenseRecordPayload>
          }
          createMany: {
            args: Prisma.LicenseRecordCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.LicenseRecordCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LicenseRecordPayload>[]
          }
          delete: {
            args: Prisma.LicenseRecordDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LicenseRecordPayload>
          }
          update: {
            args: Prisma.LicenseRecordUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LicenseRecordPayload>
          }
          deleteMany: {
            args: Prisma.LicenseRecordDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.LicenseRecordUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.LicenseRecordUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LicenseRecordPayload>
          }
          aggregate: {
            args: Prisma.LicenseRecordAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateLicenseRecord>
          }
          groupBy: {
            args: Prisma.LicenseRecordGroupByArgs<ExtArgs>
            result: $Utils.Optional<LicenseRecordGroupByOutputType>[]
          }
          count: {
            args: Prisma.LicenseRecordCountArgs<ExtArgs>
            result: $Utils.Optional<LicenseRecordCountAggregateOutputType> | number
          }
        }
      }
      OutboxEvent: {
        payload: Prisma.$OutboxEventPayload<ExtArgs>
        fields: Prisma.OutboxEventFieldRefs
        operations: {
          findUnique: {
            args: Prisma.OutboxEventFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.OutboxEventFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          findFirst: {
            args: Prisma.OutboxEventFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.OutboxEventFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          findMany: {
            args: Prisma.OutboxEventFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>[]
          }
          create: {
            args: Prisma.OutboxEventCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          createMany: {
            args: Prisma.OutboxEventCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.OutboxEventCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>[]
          }
          delete: {
            args: Prisma.OutboxEventDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          update: {
            args: Prisma.OutboxEventUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          deleteMany: {
            args: Prisma.OutboxEventDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.OutboxEventUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.OutboxEventUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          aggregate: {
            args: Prisma.OutboxEventAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateOutboxEvent>
          }
          groupBy: {
            args: Prisma.OutboxEventGroupByArgs<ExtArgs>
            result: $Utils.Optional<OutboxEventGroupByOutputType>[]
          }
          count: {
            args: Prisma.OutboxEventCountArgs<ExtArgs>
            result: $Utils.Optional<OutboxEventCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
  }


  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type MediaAssetCountOutputType
   */

  export type MediaAssetCountOutputType = {
    renditions: number
    jobs: number
  }

  export type MediaAssetCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    renditions?: boolean | MediaAssetCountOutputTypeCountRenditionsArgs
    jobs?: boolean | MediaAssetCountOutputTypeCountJobsArgs
  }

  // Custom InputTypes
  /**
   * MediaAssetCountOutputType without action
   */
  export type MediaAssetCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAssetCountOutputType
     */
    select?: MediaAssetCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * MediaAssetCountOutputType without action
   */
  export type MediaAssetCountOutputTypeCountRenditionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AssetRenditionWhereInput
  }

  /**
   * MediaAssetCountOutputType without action
   */
  export type MediaAssetCountOutputTypeCountJobsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ProcessJobWhereInput
  }


  /**
   * Models
   */

  /**
   * Model MediaAsset
   */

  export type AggregateMediaAsset = {
    _count: MediaAssetCountAggregateOutputType | null
    _avg: MediaAssetAvgAggregateOutputType | null
    _sum: MediaAssetSumAggregateOutputType | null
    _min: MediaAssetMinAggregateOutputType | null
    _max: MediaAssetMaxAggregateOutputType | null
  }

  export type MediaAssetAvgAggregateOutputType = {
    width: number | null
    height: number | null
    sizeBytes: number | null
    qcScore: number | null
    viewCount: number | null
    downloadCount: number | null
    sortOrder: number | null
  }

  export type MediaAssetSumAggregateOutputType = {
    width: number | null
    height: number | null
    sizeBytes: number | null
    qcScore: number | null
    viewCount: number | null
    downloadCount: number | null
    sortOrder: number | null
  }

  export type MediaAssetMinAggregateOutputType = {
    id: string | null
    kind: $Enums.AssetKind | null
    productId: string | null
    variantId: string | null
    role: $Enums.AssetRole | null
    rawKey: string | null
    processed: boolean | null
    status: $Enums.AssetStatus | null
    width: number | null
    height: number | null
    format: string | null
    sizeBytes: number | null
    mimeType: string | null
    phash: string | null
    blurhash: string | null
    lqipKey: string | null
    qcScore: number | null
    scanStatus: $Enums.ScanStatus | null
    isPublic: boolean | null
    viewCount: number | null
    downloadCount: number | null
    sortOrder: number | null
    uploadedBy: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type MediaAssetMaxAggregateOutputType = {
    id: string | null
    kind: $Enums.AssetKind | null
    productId: string | null
    variantId: string | null
    role: $Enums.AssetRole | null
    rawKey: string | null
    processed: boolean | null
    status: $Enums.AssetStatus | null
    width: number | null
    height: number | null
    format: string | null
    sizeBytes: number | null
    mimeType: string | null
    phash: string | null
    blurhash: string | null
    lqipKey: string | null
    qcScore: number | null
    scanStatus: $Enums.ScanStatus | null
    isPublic: boolean | null
    viewCount: number | null
    downloadCount: number | null
    sortOrder: number | null
    uploadedBy: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type MediaAssetCountAggregateOutputType = {
    id: number
    kind: number
    productId: number
    variantId: number
    role: number
    rawKey: number
    processed: number
    status: number
    width: number
    height: number
    format: number
    sizeBytes: number
    mimeType: number
    phash: number
    palette: number
    blurhash: number
    lqipKey: number
    license: number
    qcIssues: number
    qcScore: number
    scanStatus: number
    scanResult: number
    isPublic: number
    permissions: number
    viewCount: number
    downloadCount: number
    tags: number
    sortOrder: number
    uploadedBy: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type MediaAssetAvgAggregateInputType = {
    width?: true
    height?: true
    sizeBytes?: true
    qcScore?: true
    viewCount?: true
    downloadCount?: true
    sortOrder?: true
  }

  export type MediaAssetSumAggregateInputType = {
    width?: true
    height?: true
    sizeBytes?: true
    qcScore?: true
    viewCount?: true
    downloadCount?: true
    sortOrder?: true
  }

  export type MediaAssetMinAggregateInputType = {
    id?: true
    kind?: true
    productId?: true
    variantId?: true
    role?: true
    rawKey?: true
    processed?: true
    status?: true
    width?: true
    height?: true
    format?: true
    sizeBytes?: true
    mimeType?: true
    phash?: true
    blurhash?: true
    lqipKey?: true
    qcScore?: true
    scanStatus?: true
    isPublic?: true
    viewCount?: true
    downloadCount?: true
    sortOrder?: true
    uploadedBy?: true
    createdAt?: true
    updatedAt?: true
  }

  export type MediaAssetMaxAggregateInputType = {
    id?: true
    kind?: true
    productId?: true
    variantId?: true
    role?: true
    rawKey?: true
    processed?: true
    status?: true
    width?: true
    height?: true
    format?: true
    sizeBytes?: true
    mimeType?: true
    phash?: true
    blurhash?: true
    lqipKey?: true
    qcScore?: true
    scanStatus?: true
    isPublic?: true
    viewCount?: true
    downloadCount?: true
    sortOrder?: true
    uploadedBy?: true
    createdAt?: true
    updatedAt?: true
  }

  export type MediaAssetCountAggregateInputType = {
    id?: true
    kind?: true
    productId?: true
    variantId?: true
    role?: true
    rawKey?: true
    processed?: true
    status?: true
    width?: true
    height?: true
    format?: true
    sizeBytes?: true
    mimeType?: true
    phash?: true
    palette?: true
    blurhash?: true
    lqipKey?: true
    license?: true
    qcIssues?: true
    qcScore?: true
    scanStatus?: true
    scanResult?: true
    isPublic?: true
    permissions?: true
    viewCount?: true
    downloadCount?: true
    tags?: true
    sortOrder?: true
    uploadedBy?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type MediaAssetAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which MediaAsset to aggregate.
     */
    where?: MediaAssetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MediaAssets to fetch.
     */
    orderBy?: MediaAssetOrderByWithRelationInput | MediaAssetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: MediaAssetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MediaAssets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MediaAssets.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned MediaAssets
    **/
    _count?: true | MediaAssetCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: MediaAssetAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: MediaAssetSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: MediaAssetMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: MediaAssetMaxAggregateInputType
  }

  export type GetMediaAssetAggregateType<T extends MediaAssetAggregateArgs> = {
        [P in keyof T & keyof AggregateMediaAsset]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateMediaAsset[P]>
      : GetScalarType<T[P], AggregateMediaAsset[P]>
  }




  export type MediaAssetGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MediaAssetWhereInput
    orderBy?: MediaAssetOrderByWithAggregationInput | MediaAssetOrderByWithAggregationInput[]
    by: MediaAssetScalarFieldEnum[] | MediaAssetScalarFieldEnum
    having?: MediaAssetScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: MediaAssetCountAggregateInputType | true
    _avg?: MediaAssetAvgAggregateInputType
    _sum?: MediaAssetSumAggregateInputType
    _min?: MediaAssetMinAggregateInputType
    _max?: MediaAssetMaxAggregateInputType
  }

  export type MediaAssetGroupByOutputType = {
    id: string
    kind: $Enums.AssetKind
    productId: string | null
    variantId: string | null
    role: $Enums.AssetRole | null
    rawKey: string
    processed: boolean
    status: $Enums.AssetStatus
    width: number | null
    height: number | null
    format: string | null
    sizeBytes: number | null
    mimeType: string | null
    phash: string | null
    palette: JsonValue | null
    blurhash: string | null
    lqipKey: string | null
    license: JsonValue | null
    qcIssues: JsonValue | null
    qcScore: number | null
    scanStatus: $Enums.ScanStatus
    scanResult: JsonValue | null
    isPublic: boolean
    permissions: JsonValue | null
    viewCount: number
    downloadCount: number
    tags: string[]
    sortOrder: number
    uploadedBy: string | null
    createdAt: Date
    updatedAt: Date
    _count: MediaAssetCountAggregateOutputType | null
    _avg: MediaAssetAvgAggregateOutputType | null
    _sum: MediaAssetSumAggregateOutputType | null
    _min: MediaAssetMinAggregateOutputType | null
    _max: MediaAssetMaxAggregateOutputType | null
  }

  type GetMediaAssetGroupByPayload<T extends MediaAssetGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<MediaAssetGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof MediaAssetGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], MediaAssetGroupByOutputType[P]>
            : GetScalarType<T[P], MediaAssetGroupByOutputType[P]>
        }
      >
    >


  export type MediaAssetSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    kind?: boolean
    productId?: boolean
    variantId?: boolean
    role?: boolean
    rawKey?: boolean
    processed?: boolean
    status?: boolean
    width?: boolean
    height?: boolean
    format?: boolean
    sizeBytes?: boolean
    mimeType?: boolean
    phash?: boolean
    palette?: boolean
    blurhash?: boolean
    lqipKey?: boolean
    license?: boolean
    qcIssues?: boolean
    qcScore?: boolean
    scanStatus?: boolean
    scanResult?: boolean
    isPublic?: boolean
    permissions?: boolean
    viewCount?: boolean
    downloadCount?: boolean
    tags?: boolean
    sortOrder?: boolean
    uploadedBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    renditions?: boolean | MediaAsset$renditionsArgs<ExtArgs>
    threeD?: boolean | MediaAsset$threeDArgs<ExtArgs>
    jobs?: boolean | MediaAsset$jobsArgs<ExtArgs>
    _count?: boolean | MediaAssetCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["mediaAsset"]>

  export type MediaAssetSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    kind?: boolean
    productId?: boolean
    variantId?: boolean
    role?: boolean
    rawKey?: boolean
    processed?: boolean
    status?: boolean
    width?: boolean
    height?: boolean
    format?: boolean
    sizeBytes?: boolean
    mimeType?: boolean
    phash?: boolean
    palette?: boolean
    blurhash?: boolean
    lqipKey?: boolean
    license?: boolean
    qcIssues?: boolean
    qcScore?: boolean
    scanStatus?: boolean
    scanResult?: boolean
    isPublic?: boolean
    permissions?: boolean
    viewCount?: boolean
    downloadCount?: boolean
    tags?: boolean
    sortOrder?: boolean
    uploadedBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["mediaAsset"]>

  export type MediaAssetSelectScalar = {
    id?: boolean
    kind?: boolean
    productId?: boolean
    variantId?: boolean
    role?: boolean
    rawKey?: boolean
    processed?: boolean
    status?: boolean
    width?: boolean
    height?: boolean
    format?: boolean
    sizeBytes?: boolean
    mimeType?: boolean
    phash?: boolean
    palette?: boolean
    blurhash?: boolean
    lqipKey?: boolean
    license?: boolean
    qcIssues?: boolean
    qcScore?: boolean
    scanStatus?: boolean
    scanResult?: boolean
    isPublic?: boolean
    permissions?: boolean
    viewCount?: boolean
    downloadCount?: boolean
    tags?: boolean
    sortOrder?: boolean
    uploadedBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type MediaAssetInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    renditions?: boolean | MediaAsset$renditionsArgs<ExtArgs>
    threeD?: boolean | MediaAsset$threeDArgs<ExtArgs>
    jobs?: boolean | MediaAsset$jobsArgs<ExtArgs>
    _count?: boolean | MediaAssetCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type MediaAssetIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $MediaAssetPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "MediaAsset"
    objects: {
      renditions: Prisma.$AssetRenditionPayload<ExtArgs>[]
      threeD: Prisma.$ThreeDAssetPayload<ExtArgs> | null
      jobs: Prisma.$ProcessJobPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      kind: $Enums.AssetKind
      productId: string | null
      variantId: string | null
      role: $Enums.AssetRole | null
      rawKey: string
      processed: boolean
      status: $Enums.AssetStatus
      width: number | null
      height: number | null
      format: string | null
      sizeBytes: number | null
      mimeType: string | null
      phash: string | null
      palette: Prisma.JsonValue | null
      blurhash: string | null
      lqipKey: string | null
      license: Prisma.JsonValue | null
      qcIssues: Prisma.JsonValue | null
      qcScore: number | null
      scanStatus: $Enums.ScanStatus
      scanResult: Prisma.JsonValue | null
      isPublic: boolean
      permissions: Prisma.JsonValue | null
      viewCount: number
      downloadCount: number
      tags: string[]
      sortOrder: number
      uploadedBy: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["mediaAsset"]>
    composites: {}
  }

  type MediaAssetGetPayload<S extends boolean | null | undefined | MediaAssetDefaultArgs> = $Result.GetResult<Prisma.$MediaAssetPayload, S>

  type MediaAssetCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<MediaAssetFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: MediaAssetCountAggregateInputType | true
    }

  export interface MediaAssetDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['MediaAsset'], meta: { name: 'MediaAsset' } }
    /**
     * Find zero or one MediaAsset that matches the filter.
     * @param {MediaAssetFindUniqueArgs} args - Arguments to find a MediaAsset
     * @example
     * // Get one MediaAsset
     * const mediaAsset = await prisma.mediaAsset.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends MediaAssetFindUniqueArgs>(args: SelectSubset<T, MediaAssetFindUniqueArgs<ExtArgs>>): Prisma__MediaAssetClient<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one MediaAsset that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {MediaAssetFindUniqueOrThrowArgs} args - Arguments to find a MediaAsset
     * @example
     * // Get one MediaAsset
     * const mediaAsset = await prisma.mediaAsset.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends MediaAssetFindUniqueOrThrowArgs>(args: SelectSubset<T, MediaAssetFindUniqueOrThrowArgs<ExtArgs>>): Prisma__MediaAssetClient<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first MediaAsset that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MediaAssetFindFirstArgs} args - Arguments to find a MediaAsset
     * @example
     * // Get one MediaAsset
     * const mediaAsset = await prisma.mediaAsset.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends MediaAssetFindFirstArgs>(args?: SelectSubset<T, MediaAssetFindFirstArgs<ExtArgs>>): Prisma__MediaAssetClient<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first MediaAsset that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MediaAssetFindFirstOrThrowArgs} args - Arguments to find a MediaAsset
     * @example
     * // Get one MediaAsset
     * const mediaAsset = await prisma.mediaAsset.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends MediaAssetFindFirstOrThrowArgs>(args?: SelectSubset<T, MediaAssetFindFirstOrThrowArgs<ExtArgs>>): Prisma__MediaAssetClient<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more MediaAssets that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MediaAssetFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all MediaAssets
     * const mediaAssets = await prisma.mediaAsset.findMany()
     * 
     * // Get first 10 MediaAssets
     * const mediaAssets = await prisma.mediaAsset.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const mediaAssetWithIdOnly = await prisma.mediaAsset.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends MediaAssetFindManyArgs>(args?: SelectSubset<T, MediaAssetFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a MediaAsset.
     * @param {MediaAssetCreateArgs} args - Arguments to create a MediaAsset.
     * @example
     * // Create one MediaAsset
     * const MediaAsset = await prisma.mediaAsset.create({
     *   data: {
     *     // ... data to create a MediaAsset
     *   }
     * })
     * 
     */
    create<T extends MediaAssetCreateArgs>(args: SelectSubset<T, MediaAssetCreateArgs<ExtArgs>>): Prisma__MediaAssetClient<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many MediaAssets.
     * @param {MediaAssetCreateManyArgs} args - Arguments to create many MediaAssets.
     * @example
     * // Create many MediaAssets
     * const mediaAsset = await prisma.mediaAsset.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends MediaAssetCreateManyArgs>(args?: SelectSubset<T, MediaAssetCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many MediaAssets and returns the data saved in the database.
     * @param {MediaAssetCreateManyAndReturnArgs} args - Arguments to create many MediaAssets.
     * @example
     * // Create many MediaAssets
     * const mediaAsset = await prisma.mediaAsset.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many MediaAssets and only return the `id`
     * const mediaAssetWithIdOnly = await prisma.mediaAsset.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends MediaAssetCreateManyAndReturnArgs>(args?: SelectSubset<T, MediaAssetCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a MediaAsset.
     * @param {MediaAssetDeleteArgs} args - Arguments to delete one MediaAsset.
     * @example
     * // Delete one MediaAsset
     * const MediaAsset = await prisma.mediaAsset.delete({
     *   where: {
     *     // ... filter to delete one MediaAsset
     *   }
     * })
     * 
     */
    delete<T extends MediaAssetDeleteArgs>(args: SelectSubset<T, MediaAssetDeleteArgs<ExtArgs>>): Prisma__MediaAssetClient<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one MediaAsset.
     * @param {MediaAssetUpdateArgs} args - Arguments to update one MediaAsset.
     * @example
     * // Update one MediaAsset
     * const mediaAsset = await prisma.mediaAsset.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends MediaAssetUpdateArgs>(args: SelectSubset<T, MediaAssetUpdateArgs<ExtArgs>>): Prisma__MediaAssetClient<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more MediaAssets.
     * @param {MediaAssetDeleteManyArgs} args - Arguments to filter MediaAssets to delete.
     * @example
     * // Delete a few MediaAssets
     * const { count } = await prisma.mediaAsset.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends MediaAssetDeleteManyArgs>(args?: SelectSubset<T, MediaAssetDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more MediaAssets.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MediaAssetUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many MediaAssets
     * const mediaAsset = await prisma.mediaAsset.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends MediaAssetUpdateManyArgs>(args: SelectSubset<T, MediaAssetUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one MediaAsset.
     * @param {MediaAssetUpsertArgs} args - Arguments to update or create a MediaAsset.
     * @example
     * // Update or create a MediaAsset
     * const mediaAsset = await prisma.mediaAsset.upsert({
     *   create: {
     *     // ... data to create a MediaAsset
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the MediaAsset we want to update
     *   }
     * })
     */
    upsert<T extends MediaAssetUpsertArgs>(args: SelectSubset<T, MediaAssetUpsertArgs<ExtArgs>>): Prisma__MediaAssetClient<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of MediaAssets.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MediaAssetCountArgs} args - Arguments to filter MediaAssets to count.
     * @example
     * // Count the number of MediaAssets
     * const count = await prisma.mediaAsset.count({
     *   where: {
     *     // ... the filter for the MediaAssets we want to count
     *   }
     * })
    **/
    count<T extends MediaAssetCountArgs>(
      args?: Subset<T, MediaAssetCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], MediaAssetCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a MediaAsset.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MediaAssetAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends MediaAssetAggregateArgs>(args: Subset<T, MediaAssetAggregateArgs>): Prisma.PrismaPromise<GetMediaAssetAggregateType<T>>

    /**
     * Group by MediaAsset.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MediaAssetGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends MediaAssetGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: MediaAssetGroupByArgs['orderBy'] }
        : { orderBy?: MediaAssetGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, MediaAssetGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetMediaAssetGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the MediaAsset model
   */
  readonly fields: MediaAssetFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for MediaAsset.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__MediaAssetClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    renditions<T extends MediaAsset$renditionsArgs<ExtArgs> = {}>(args?: Subset<T, MediaAsset$renditionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AssetRenditionPayload<ExtArgs>, T, "findMany"> | Null>
    threeD<T extends MediaAsset$threeDArgs<ExtArgs> = {}>(args?: Subset<T, MediaAsset$threeDArgs<ExtArgs>>): Prisma__ThreeDAssetClient<$Result.GetResult<Prisma.$ThreeDAssetPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    jobs<T extends MediaAsset$jobsArgs<ExtArgs> = {}>(args?: Subset<T, MediaAsset$jobsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ProcessJobPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the MediaAsset model
   */ 
  interface MediaAssetFieldRefs {
    readonly id: FieldRef<"MediaAsset", 'String'>
    readonly kind: FieldRef<"MediaAsset", 'AssetKind'>
    readonly productId: FieldRef<"MediaAsset", 'String'>
    readonly variantId: FieldRef<"MediaAsset", 'String'>
    readonly role: FieldRef<"MediaAsset", 'AssetRole'>
    readonly rawKey: FieldRef<"MediaAsset", 'String'>
    readonly processed: FieldRef<"MediaAsset", 'Boolean'>
    readonly status: FieldRef<"MediaAsset", 'AssetStatus'>
    readonly width: FieldRef<"MediaAsset", 'Int'>
    readonly height: FieldRef<"MediaAsset", 'Int'>
    readonly format: FieldRef<"MediaAsset", 'String'>
    readonly sizeBytes: FieldRef<"MediaAsset", 'Int'>
    readonly mimeType: FieldRef<"MediaAsset", 'String'>
    readonly phash: FieldRef<"MediaAsset", 'String'>
    readonly palette: FieldRef<"MediaAsset", 'Json'>
    readonly blurhash: FieldRef<"MediaAsset", 'String'>
    readonly lqipKey: FieldRef<"MediaAsset", 'String'>
    readonly license: FieldRef<"MediaAsset", 'Json'>
    readonly qcIssues: FieldRef<"MediaAsset", 'Json'>
    readonly qcScore: FieldRef<"MediaAsset", 'Float'>
    readonly scanStatus: FieldRef<"MediaAsset", 'ScanStatus'>
    readonly scanResult: FieldRef<"MediaAsset", 'Json'>
    readonly isPublic: FieldRef<"MediaAsset", 'Boolean'>
    readonly permissions: FieldRef<"MediaAsset", 'Json'>
    readonly viewCount: FieldRef<"MediaAsset", 'Int'>
    readonly downloadCount: FieldRef<"MediaAsset", 'Int'>
    readonly tags: FieldRef<"MediaAsset", 'String[]'>
    readonly sortOrder: FieldRef<"MediaAsset", 'Int'>
    readonly uploadedBy: FieldRef<"MediaAsset", 'String'>
    readonly createdAt: FieldRef<"MediaAsset", 'DateTime'>
    readonly updatedAt: FieldRef<"MediaAsset", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * MediaAsset findUnique
   */
  export type MediaAssetFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAsset
     */
    select?: MediaAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MediaAssetInclude<ExtArgs> | null
    /**
     * Filter, which MediaAsset to fetch.
     */
    where: MediaAssetWhereUniqueInput
  }

  /**
   * MediaAsset findUniqueOrThrow
   */
  export type MediaAssetFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAsset
     */
    select?: MediaAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MediaAssetInclude<ExtArgs> | null
    /**
     * Filter, which MediaAsset to fetch.
     */
    where: MediaAssetWhereUniqueInput
  }

  /**
   * MediaAsset findFirst
   */
  export type MediaAssetFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAsset
     */
    select?: MediaAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MediaAssetInclude<ExtArgs> | null
    /**
     * Filter, which MediaAsset to fetch.
     */
    where?: MediaAssetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MediaAssets to fetch.
     */
    orderBy?: MediaAssetOrderByWithRelationInput | MediaAssetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for MediaAssets.
     */
    cursor?: MediaAssetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MediaAssets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MediaAssets.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of MediaAssets.
     */
    distinct?: MediaAssetScalarFieldEnum | MediaAssetScalarFieldEnum[]
  }

  /**
   * MediaAsset findFirstOrThrow
   */
  export type MediaAssetFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAsset
     */
    select?: MediaAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MediaAssetInclude<ExtArgs> | null
    /**
     * Filter, which MediaAsset to fetch.
     */
    where?: MediaAssetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MediaAssets to fetch.
     */
    orderBy?: MediaAssetOrderByWithRelationInput | MediaAssetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for MediaAssets.
     */
    cursor?: MediaAssetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MediaAssets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MediaAssets.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of MediaAssets.
     */
    distinct?: MediaAssetScalarFieldEnum | MediaAssetScalarFieldEnum[]
  }

  /**
   * MediaAsset findMany
   */
  export type MediaAssetFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAsset
     */
    select?: MediaAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MediaAssetInclude<ExtArgs> | null
    /**
     * Filter, which MediaAssets to fetch.
     */
    where?: MediaAssetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MediaAssets to fetch.
     */
    orderBy?: MediaAssetOrderByWithRelationInput | MediaAssetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing MediaAssets.
     */
    cursor?: MediaAssetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MediaAssets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MediaAssets.
     */
    skip?: number
    distinct?: MediaAssetScalarFieldEnum | MediaAssetScalarFieldEnum[]
  }

  /**
   * MediaAsset create
   */
  export type MediaAssetCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAsset
     */
    select?: MediaAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MediaAssetInclude<ExtArgs> | null
    /**
     * The data needed to create a MediaAsset.
     */
    data: XOR<MediaAssetCreateInput, MediaAssetUncheckedCreateInput>
  }

  /**
   * MediaAsset createMany
   */
  export type MediaAssetCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many MediaAssets.
     */
    data: MediaAssetCreateManyInput | MediaAssetCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * MediaAsset createManyAndReturn
   */
  export type MediaAssetCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAsset
     */
    select?: MediaAssetSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many MediaAssets.
     */
    data: MediaAssetCreateManyInput | MediaAssetCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * MediaAsset update
   */
  export type MediaAssetUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAsset
     */
    select?: MediaAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MediaAssetInclude<ExtArgs> | null
    /**
     * The data needed to update a MediaAsset.
     */
    data: XOR<MediaAssetUpdateInput, MediaAssetUncheckedUpdateInput>
    /**
     * Choose, which MediaAsset to update.
     */
    where: MediaAssetWhereUniqueInput
  }

  /**
   * MediaAsset updateMany
   */
  export type MediaAssetUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update MediaAssets.
     */
    data: XOR<MediaAssetUpdateManyMutationInput, MediaAssetUncheckedUpdateManyInput>
    /**
     * Filter which MediaAssets to update
     */
    where?: MediaAssetWhereInput
  }

  /**
   * MediaAsset upsert
   */
  export type MediaAssetUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAsset
     */
    select?: MediaAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MediaAssetInclude<ExtArgs> | null
    /**
     * The filter to search for the MediaAsset to update in case it exists.
     */
    where: MediaAssetWhereUniqueInput
    /**
     * In case the MediaAsset found by the `where` argument doesn't exist, create a new MediaAsset with this data.
     */
    create: XOR<MediaAssetCreateInput, MediaAssetUncheckedCreateInput>
    /**
     * In case the MediaAsset was found with the provided `where` argument, update it with this data.
     */
    update: XOR<MediaAssetUpdateInput, MediaAssetUncheckedUpdateInput>
  }

  /**
   * MediaAsset delete
   */
  export type MediaAssetDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAsset
     */
    select?: MediaAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MediaAssetInclude<ExtArgs> | null
    /**
     * Filter which MediaAsset to delete.
     */
    where: MediaAssetWhereUniqueInput
  }

  /**
   * MediaAsset deleteMany
   */
  export type MediaAssetDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which MediaAssets to delete
     */
    where?: MediaAssetWhereInput
  }

  /**
   * MediaAsset.renditions
   */
  export type MediaAsset$renditionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionInclude<ExtArgs> | null
    where?: AssetRenditionWhereInput
    orderBy?: AssetRenditionOrderByWithRelationInput | AssetRenditionOrderByWithRelationInput[]
    cursor?: AssetRenditionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: AssetRenditionScalarFieldEnum | AssetRenditionScalarFieldEnum[]
  }

  /**
   * MediaAsset.threeD
   */
  export type MediaAsset$threeDArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetInclude<ExtArgs> | null
    where?: ThreeDAssetWhereInput
  }

  /**
   * MediaAsset.jobs
   */
  export type MediaAsset$jobsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobInclude<ExtArgs> | null
    where?: ProcessJobWhereInput
    orderBy?: ProcessJobOrderByWithRelationInput | ProcessJobOrderByWithRelationInput[]
    cursor?: ProcessJobWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ProcessJobScalarFieldEnum | ProcessJobScalarFieldEnum[]
  }

  /**
   * MediaAsset without action
   */
  export type MediaAssetDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MediaAsset
     */
    select?: MediaAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MediaAssetInclude<ExtArgs> | null
  }


  /**
   * Model AssetRendition
   */

  export type AggregateAssetRendition = {
    _count: AssetRenditionCountAggregateOutputType | null
    _avg: AssetRenditionAvgAggregateOutputType | null
    _sum: AssetRenditionSumAggregateOutputType | null
    _min: AssetRenditionMinAggregateOutputType | null
    _max: AssetRenditionMaxAggregateOutputType | null
  }

  export type AssetRenditionAvgAggregateOutputType = {
    width: number | null
    height: number | null
    sizeBytes: number | null
  }

  export type AssetRenditionSumAggregateOutputType = {
    width: number | null
    height: number | null
    sizeBytes: number | null
  }

  export type AssetRenditionMinAggregateOutputType = {
    id: string | null
    assetId: string | null
    key: string | null
    width: number | null
    height: number | null
    format: $Enums.RenditionFormat | null
    sizeBytes: number | null
    purpose: $Enums.RenditionPurpose | null
    createdAt: Date | null
  }

  export type AssetRenditionMaxAggregateOutputType = {
    id: string | null
    assetId: string | null
    key: string | null
    width: number | null
    height: number | null
    format: $Enums.RenditionFormat | null
    sizeBytes: number | null
    purpose: $Enums.RenditionPurpose | null
    createdAt: Date | null
  }

  export type AssetRenditionCountAggregateOutputType = {
    id: number
    assetId: number
    key: number
    width: number
    height: number
    format: number
    sizeBytes: number
    purpose: number
    transform: number
    createdAt: number
    _all: number
  }


  export type AssetRenditionAvgAggregateInputType = {
    width?: true
    height?: true
    sizeBytes?: true
  }

  export type AssetRenditionSumAggregateInputType = {
    width?: true
    height?: true
    sizeBytes?: true
  }

  export type AssetRenditionMinAggregateInputType = {
    id?: true
    assetId?: true
    key?: true
    width?: true
    height?: true
    format?: true
    sizeBytes?: true
    purpose?: true
    createdAt?: true
  }

  export type AssetRenditionMaxAggregateInputType = {
    id?: true
    assetId?: true
    key?: true
    width?: true
    height?: true
    format?: true
    sizeBytes?: true
    purpose?: true
    createdAt?: true
  }

  export type AssetRenditionCountAggregateInputType = {
    id?: true
    assetId?: true
    key?: true
    width?: true
    height?: true
    format?: true
    sizeBytes?: true
    purpose?: true
    transform?: true
    createdAt?: true
    _all?: true
  }

  export type AssetRenditionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AssetRendition to aggregate.
     */
    where?: AssetRenditionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AssetRenditions to fetch.
     */
    orderBy?: AssetRenditionOrderByWithRelationInput | AssetRenditionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AssetRenditionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AssetRenditions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AssetRenditions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AssetRenditions
    **/
    _count?: true | AssetRenditionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: AssetRenditionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: AssetRenditionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AssetRenditionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AssetRenditionMaxAggregateInputType
  }

  export type GetAssetRenditionAggregateType<T extends AssetRenditionAggregateArgs> = {
        [P in keyof T & keyof AggregateAssetRendition]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAssetRendition[P]>
      : GetScalarType<T[P], AggregateAssetRendition[P]>
  }




  export type AssetRenditionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AssetRenditionWhereInput
    orderBy?: AssetRenditionOrderByWithAggregationInput | AssetRenditionOrderByWithAggregationInput[]
    by: AssetRenditionScalarFieldEnum[] | AssetRenditionScalarFieldEnum
    having?: AssetRenditionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AssetRenditionCountAggregateInputType | true
    _avg?: AssetRenditionAvgAggregateInputType
    _sum?: AssetRenditionSumAggregateInputType
    _min?: AssetRenditionMinAggregateInputType
    _max?: AssetRenditionMaxAggregateInputType
  }

  export type AssetRenditionGroupByOutputType = {
    id: string
    assetId: string
    key: string
    width: number | null
    height: number | null
    format: $Enums.RenditionFormat
    sizeBytes: number | null
    purpose: $Enums.RenditionPurpose
    transform: JsonValue | null
    createdAt: Date
    _count: AssetRenditionCountAggregateOutputType | null
    _avg: AssetRenditionAvgAggregateOutputType | null
    _sum: AssetRenditionSumAggregateOutputType | null
    _min: AssetRenditionMinAggregateOutputType | null
    _max: AssetRenditionMaxAggregateOutputType | null
  }

  type GetAssetRenditionGroupByPayload<T extends AssetRenditionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AssetRenditionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AssetRenditionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AssetRenditionGroupByOutputType[P]>
            : GetScalarType<T[P], AssetRenditionGroupByOutputType[P]>
        }
      >
    >


  export type AssetRenditionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    assetId?: boolean
    key?: boolean
    width?: boolean
    height?: boolean
    format?: boolean
    sizeBytes?: boolean
    purpose?: boolean
    transform?: boolean
    createdAt?: boolean
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["assetRendition"]>

  export type AssetRenditionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    assetId?: boolean
    key?: boolean
    width?: boolean
    height?: boolean
    format?: boolean
    sizeBytes?: boolean
    purpose?: boolean
    transform?: boolean
    createdAt?: boolean
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["assetRendition"]>

  export type AssetRenditionSelectScalar = {
    id?: boolean
    assetId?: boolean
    key?: boolean
    width?: boolean
    height?: boolean
    format?: boolean
    sizeBytes?: boolean
    purpose?: boolean
    transform?: boolean
    createdAt?: boolean
  }

  export type AssetRenditionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }
  export type AssetRenditionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }

  export type $AssetRenditionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AssetRendition"
    objects: {
      asset: Prisma.$MediaAssetPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      assetId: string
      key: string
      width: number | null
      height: number | null
      format: $Enums.RenditionFormat
      sizeBytes: number | null
      purpose: $Enums.RenditionPurpose
      transform: Prisma.JsonValue | null
      createdAt: Date
    }, ExtArgs["result"]["assetRendition"]>
    composites: {}
  }

  type AssetRenditionGetPayload<S extends boolean | null | undefined | AssetRenditionDefaultArgs> = $Result.GetResult<Prisma.$AssetRenditionPayload, S>

  type AssetRenditionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<AssetRenditionFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: AssetRenditionCountAggregateInputType | true
    }

  export interface AssetRenditionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AssetRendition'], meta: { name: 'AssetRendition' } }
    /**
     * Find zero or one AssetRendition that matches the filter.
     * @param {AssetRenditionFindUniqueArgs} args - Arguments to find a AssetRendition
     * @example
     * // Get one AssetRendition
     * const assetRendition = await prisma.assetRendition.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AssetRenditionFindUniqueArgs>(args: SelectSubset<T, AssetRenditionFindUniqueArgs<ExtArgs>>): Prisma__AssetRenditionClient<$Result.GetResult<Prisma.$AssetRenditionPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one AssetRendition that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {AssetRenditionFindUniqueOrThrowArgs} args - Arguments to find a AssetRendition
     * @example
     * // Get one AssetRendition
     * const assetRendition = await prisma.assetRendition.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AssetRenditionFindUniqueOrThrowArgs>(args: SelectSubset<T, AssetRenditionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AssetRenditionClient<$Result.GetResult<Prisma.$AssetRenditionPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first AssetRendition that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AssetRenditionFindFirstArgs} args - Arguments to find a AssetRendition
     * @example
     * // Get one AssetRendition
     * const assetRendition = await prisma.assetRendition.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AssetRenditionFindFirstArgs>(args?: SelectSubset<T, AssetRenditionFindFirstArgs<ExtArgs>>): Prisma__AssetRenditionClient<$Result.GetResult<Prisma.$AssetRenditionPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first AssetRendition that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AssetRenditionFindFirstOrThrowArgs} args - Arguments to find a AssetRendition
     * @example
     * // Get one AssetRendition
     * const assetRendition = await prisma.assetRendition.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AssetRenditionFindFirstOrThrowArgs>(args?: SelectSubset<T, AssetRenditionFindFirstOrThrowArgs<ExtArgs>>): Prisma__AssetRenditionClient<$Result.GetResult<Prisma.$AssetRenditionPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more AssetRenditions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AssetRenditionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AssetRenditions
     * const assetRenditions = await prisma.assetRendition.findMany()
     * 
     * // Get first 10 AssetRenditions
     * const assetRenditions = await prisma.assetRendition.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const assetRenditionWithIdOnly = await prisma.assetRendition.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AssetRenditionFindManyArgs>(args?: SelectSubset<T, AssetRenditionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AssetRenditionPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a AssetRendition.
     * @param {AssetRenditionCreateArgs} args - Arguments to create a AssetRendition.
     * @example
     * // Create one AssetRendition
     * const AssetRendition = await prisma.assetRendition.create({
     *   data: {
     *     // ... data to create a AssetRendition
     *   }
     * })
     * 
     */
    create<T extends AssetRenditionCreateArgs>(args: SelectSubset<T, AssetRenditionCreateArgs<ExtArgs>>): Prisma__AssetRenditionClient<$Result.GetResult<Prisma.$AssetRenditionPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many AssetRenditions.
     * @param {AssetRenditionCreateManyArgs} args - Arguments to create many AssetRenditions.
     * @example
     * // Create many AssetRenditions
     * const assetRendition = await prisma.assetRendition.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AssetRenditionCreateManyArgs>(args?: SelectSubset<T, AssetRenditionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many AssetRenditions and returns the data saved in the database.
     * @param {AssetRenditionCreateManyAndReturnArgs} args - Arguments to create many AssetRenditions.
     * @example
     * // Create many AssetRenditions
     * const assetRendition = await prisma.assetRendition.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many AssetRenditions and only return the `id`
     * const assetRenditionWithIdOnly = await prisma.assetRendition.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AssetRenditionCreateManyAndReturnArgs>(args?: SelectSubset<T, AssetRenditionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AssetRenditionPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a AssetRendition.
     * @param {AssetRenditionDeleteArgs} args - Arguments to delete one AssetRendition.
     * @example
     * // Delete one AssetRendition
     * const AssetRendition = await prisma.assetRendition.delete({
     *   where: {
     *     // ... filter to delete one AssetRendition
     *   }
     * })
     * 
     */
    delete<T extends AssetRenditionDeleteArgs>(args: SelectSubset<T, AssetRenditionDeleteArgs<ExtArgs>>): Prisma__AssetRenditionClient<$Result.GetResult<Prisma.$AssetRenditionPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one AssetRendition.
     * @param {AssetRenditionUpdateArgs} args - Arguments to update one AssetRendition.
     * @example
     * // Update one AssetRendition
     * const assetRendition = await prisma.assetRendition.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AssetRenditionUpdateArgs>(args: SelectSubset<T, AssetRenditionUpdateArgs<ExtArgs>>): Prisma__AssetRenditionClient<$Result.GetResult<Prisma.$AssetRenditionPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more AssetRenditions.
     * @param {AssetRenditionDeleteManyArgs} args - Arguments to filter AssetRenditions to delete.
     * @example
     * // Delete a few AssetRenditions
     * const { count } = await prisma.assetRendition.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AssetRenditionDeleteManyArgs>(args?: SelectSubset<T, AssetRenditionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AssetRenditions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AssetRenditionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AssetRenditions
     * const assetRendition = await prisma.assetRendition.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AssetRenditionUpdateManyArgs>(args: SelectSubset<T, AssetRenditionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one AssetRendition.
     * @param {AssetRenditionUpsertArgs} args - Arguments to update or create a AssetRendition.
     * @example
     * // Update or create a AssetRendition
     * const assetRendition = await prisma.assetRendition.upsert({
     *   create: {
     *     // ... data to create a AssetRendition
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AssetRendition we want to update
     *   }
     * })
     */
    upsert<T extends AssetRenditionUpsertArgs>(args: SelectSubset<T, AssetRenditionUpsertArgs<ExtArgs>>): Prisma__AssetRenditionClient<$Result.GetResult<Prisma.$AssetRenditionPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of AssetRenditions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AssetRenditionCountArgs} args - Arguments to filter AssetRenditions to count.
     * @example
     * // Count the number of AssetRenditions
     * const count = await prisma.assetRendition.count({
     *   where: {
     *     // ... the filter for the AssetRenditions we want to count
     *   }
     * })
    **/
    count<T extends AssetRenditionCountArgs>(
      args?: Subset<T, AssetRenditionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AssetRenditionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AssetRendition.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AssetRenditionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AssetRenditionAggregateArgs>(args: Subset<T, AssetRenditionAggregateArgs>): Prisma.PrismaPromise<GetAssetRenditionAggregateType<T>>

    /**
     * Group by AssetRendition.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AssetRenditionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AssetRenditionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AssetRenditionGroupByArgs['orderBy'] }
        : { orderBy?: AssetRenditionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AssetRenditionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAssetRenditionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AssetRendition model
   */
  readonly fields: AssetRenditionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AssetRendition.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AssetRenditionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    asset<T extends MediaAssetDefaultArgs<ExtArgs> = {}>(args?: Subset<T, MediaAssetDefaultArgs<ExtArgs>>): Prisma__MediaAssetClient<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AssetRendition model
   */ 
  interface AssetRenditionFieldRefs {
    readonly id: FieldRef<"AssetRendition", 'String'>
    readonly assetId: FieldRef<"AssetRendition", 'String'>
    readonly key: FieldRef<"AssetRendition", 'String'>
    readonly width: FieldRef<"AssetRendition", 'Int'>
    readonly height: FieldRef<"AssetRendition", 'Int'>
    readonly format: FieldRef<"AssetRendition", 'RenditionFormat'>
    readonly sizeBytes: FieldRef<"AssetRendition", 'Int'>
    readonly purpose: FieldRef<"AssetRendition", 'RenditionPurpose'>
    readonly transform: FieldRef<"AssetRendition", 'Json'>
    readonly createdAt: FieldRef<"AssetRendition", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * AssetRendition findUnique
   */
  export type AssetRenditionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionInclude<ExtArgs> | null
    /**
     * Filter, which AssetRendition to fetch.
     */
    where: AssetRenditionWhereUniqueInput
  }

  /**
   * AssetRendition findUniqueOrThrow
   */
  export type AssetRenditionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionInclude<ExtArgs> | null
    /**
     * Filter, which AssetRendition to fetch.
     */
    where: AssetRenditionWhereUniqueInput
  }

  /**
   * AssetRendition findFirst
   */
  export type AssetRenditionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionInclude<ExtArgs> | null
    /**
     * Filter, which AssetRendition to fetch.
     */
    where?: AssetRenditionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AssetRenditions to fetch.
     */
    orderBy?: AssetRenditionOrderByWithRelationInput | AssetRenditionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AssetRenditions.
     */
    cursor?: AssetRenditionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AssetRenditions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AssetRenditions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AssetRenditions.
     */
    distinct?: AssetRenditionScalarFieldEnum | AssetRenditionScalarFieldEnum[]
  }

  /**
   * AssetRendition findFirstOrThrow
   */
  export type AssetRenditionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionInclude<ExtArgs> | null
    /**
     * Filter, which AssetRendition to fetch.
     */
    where?: AssetRenditionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AssetRenditions to fetch.
     */
    orderBy?: AssetRenditionOrderByWithRelationInput | AssetRenditionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AssetRenditions.
     */
    cursor?: AssetRenditionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AssetRenditions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AssetRenditions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AssetRenditions.
     */
    distinct?: AssetRenditionScalarFieldEnum | AssetRenditionScalarFieldEnum[]
  }

  /**
   * AssetRendition findMany
   */
  export type AssetRenditionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionInclude<ExtArgs> | null
    /**
     * Filter, which AssetRenditions to fetch.
     */
    where?: AssetRenditionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AssetRenditions to fetch.
     */
    orderBy?: AssetRenditionOrderByWithRelationInput | AssetRenditionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AssetRenditions.
     */
    cursor?: AssetRenditionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AssetRenditions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AssetRenditions.
     */
    skip?: number
    distinct?: AssetRenditionScalarFieldEnum | AssetRenditionScalarFieldEnum[]
  }

  /**
   * AssetRendition create
   */
  export type AssetRenditionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionInclude<ExtArgs> | null
    /**
     * The data needed to create a AssetRendition.
     */
    data: XOR<AssetRenditionCreateInput, AssetRenditionUncheckedCreateInput>
  }

  /**
   * AssetRendition createMany
   */
  export type AssetRenditionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AssetRenditions.
     */
    data: AssetRenditionCreateManyInput | AssetRenditionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AssetRendition createManyAndReturn
   */
  export type AssetRenditionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many AssetRenditions.
     */
    data: AssetRenditionCreateManyInput | AssetRenditionCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * AssetRendition update
   */
  export type AssetRenditionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionInclude<ExtArgs> | null
    /**
     * The data needed to update a AssetRendition.
     */
    data: XOR<AssetRenditionUpdateInput, AssetRenditionUncheckedUpdateInput>
    /**
     * Choose, which AssetRendition to update.
     */
    where: AssetRenditionWhereUniqueInput
  }

  /**
   * AssetRendition updateMany
   */
  export type AssetRenditionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AssetRenditions.
     */
    data: XOR<AssetRenditionUpdateManyMutationInput, AssetRenditionUncheckedUpdateManyInput>
    /**
     * Filter which AssetRenditions to update
     */
    where?: AssetRenditionWhereInput
  }

  /**
   * AssetRendition upsert
   */
  export type AssetRenditionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionInclude<ExtArgs> | null
    /**
     * The filter to search for the AssetRendition to update in case it exists.
     */
    where: AssetRenditionWhereUniqueInput
    /**
     * In case the AssetRendition found by the `where` argument doesn't exist, create a new AssetRendition with this data.
     */
    create: XOR<AssetRenditionCreateInput, AssetRenditionUncheckedCreateInput>
    /**
     * In case the AssetRendition was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AssetRenditionUpdateInput, AssetRenditionUncheckedUpdateInput>
  }

  /**
   * AssetRendition delete
   */
  export type AssetRenditionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionInclude<ExtArgs> | null
    /**
     * Filter which AssetRendition to delete.
     */
    where: AssetRenditionWhereUniqueInput
  }

  /**
   * AssetRendition deleteMany
   */
  export type AssetRenditionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AssetRenditions to delete
     */
    where?: AssetRenditionWhereInput
  }

  /**
   * AssetRendition without action
   */
  export type AssetRenditionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AssetRendition
     */
    select?: AssetRenditionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AssetRenditionInclude<ExtArgs> | null
  }


  /**
   * Model ThreeDAsset
   */

  export type AggregateThreeDAsset = {
    _count: ThreeDAssetCountAggregateOutputType | null
    _avg: ThreeDAssetAvgAggregateOutputType | null
    _sum: ThreeDAssetSumAggregateOutputType | null
    _min: ThreeDAssetMinAggregateOutputType | null
    _max: ThreeDAssetMaxAggregateOutputType | null
  }

  export type ThreeDAssetAvgAggregateOutputType = {
    triCount: number | null
    nodeCount: number | null
    materialCount: number | null
    textureCount: number | null
    widthM: number | null
    heightM: number | null
    depthM: number | null
    volumeM3: number | null
    drawCalls: number | null
  }

  export type ThreeDAssetSumAggregateOutputType = {
    triCount: number | null
    nodeCount: number | null
    materialCount: number | null
    textureCount: number | null
    widthM: number | null
    heightM: number | null
    depthM: number | null
    volumeM3: number | null
    drawCalls: number | null
  }

  export type ThreeDAssetMinAggregateOutputType = {
    id: string | null
    assetId: string | null
    glbKey: string | null
    usdzKey: string | null
    triCount: number | null
    nodeCount: number | null
    materialCount: number | null
    textureCount: number | null
    widthM: number | null
    heightM: number | null
    depthM: number | null
    volumeM3: number | null
    arReady: boolean | null
    drawCalls: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ThreeDAssetMaxAggregateOutputType = {
    id: string | null
    assetId: string | null
    glbKey: string | null
    usdzKey: string | null
    triCount: number | null
    nodeCount: number | null
    materialCount: number | null
    textureCount: number | null
    widthM: number | null
    heightM: number | null
    depthM: number | null
    volumeM3: number | null
    arReady: boolean | null
    drawCalls: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ThreeDAssetCountAggregateOutputType = {
    id: number
    assetId: number
    glbKey: number
    usdzKey: number
    triCount: number
    nodeCount: number
    materialCount: number
    textureCount: number
    widthM: number
    heightM: number
    depthM: number
    volumeM3: number
    lods: number
    materials: number
    textures: number
    arReady: number
    arChecks: number
    snapshots: number
    qcIssues: number
    drawCalls: number
    perfBudget: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type ThreeDAssetAvgAggregateInputType = {
    triCount?: true
    nodeCount?: true
    materialCount?: true
    textureCount?: true
    widthM?: true
    heightM?: true
    depthM?: true
    volumeM3?: true
    drawCalls?: true
  }

  export type ThreeDAssetSumAggregateInputType = {
    triCount?: true
    nodeCount?: true
    materialCount?: true
    textureCount?: true
    widthM?: true
    heightM?: true
    depthM?: true
    volumeM3?: true
    drawCalls?: true
  }

  export type ThreeDAssetMinAggregateInputType = {
    id?: true
    assetId?: true
    glbKey?: true
    usdzKey?: true
    triCount?: true
    nodeCount?: true
    materialCount?: true
    textureCount?: true
    widthM?: true
    heightM?: true
    depthM?: true
    volumeM3?: true
    arReady?: true
    drawCalls?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ThreeDAssetMaxAggregateInputType = {
    id?: true
    assetId?: true
    glbKey?: true
    usdzKey?: true
    triCount?: true
    nodeCount?: true
    materialCount?: true
    textureCount?: true
    widthM?: true
    heightM?: true
    depthM?: true
    volumeM3?: true
    arReady?: true
    drawCalls?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ThreeDAssetCountAggregateInputType = {
    id?: true
    assetId?: true
    glbKey?: true
    usdzKey?: true
    triCount?: true
    nodeCount?: true
    materialCount?: true
    textureCount?: true
    widthM?: true
    heightM?: true
    depthM?: true
    volumeM3?: true
    lods?: true
    materials?: true
    textures?: true
    arReady?: true
    arChecks?: true
    snapshots?: true
    qcIssues?: true
    drawCalls?: true
    perfBudget?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type ThreeDAssetAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ThreeDAsset to aggregate.
     */
    where?: ThreeDAssetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ThreeDAssets to fetch.
     */
    orderBy?: ThreeDAssetOrderByWithRelationInput | ThreeDAssetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ThreeDAssetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ThreeDAssets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ThreeDAssets.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ThreeDAssets
    **/
    _count?: true | ThreeDAssetCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ThreeDAssetAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ThreeDAssetSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ThreeDAssetMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ThreeDAssetMaxAggregateInputType
  }

  export type GetThreeDAssetAggregateType<T extends ThreeDAssetAggregateArgs> = {
        [P in keyof T & keyof AggregateThreeDAsset]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateThreeDAsset[P]>
      : GetScalarType<T[P], AggregateThreeDAsset[P]>
  }




  export type ThreeDAssetGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ThreeDAssetWhereInput
    orderBy?: ThreeDAssetOrderByWithAggregationInput | ThreeDAssetOrderByWithAggregationInput[]
    by: ThreeDAssetScalarFieldEnum[] | ThreeDAssetScalarFieldEnum
    having?: ThreeDAssetScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ThreeDAssetCountAggregateInputType | true
    _avg?: ThreeDAssetAvgAggregateInputType
    _sum?: ThreeDAssetSumAggregateInputType
    _min?: ThreeDAssetMinAggregateInputType
    _max?: ThreeDAssetMaxAggregateInputType
  }

  export type ThreeDAssetGroupByOutputType = {
    id: string
    assetId: string
    glbKey: string | null
    usdzKey: string | null
    triCount: number | null
    nodeCount: number | null
    materialCount: number | null
    textureCount: number | null
    widthM: number | null
    heightM: number | null
    depthM: number | null
    volumeM3: number | null
    lods: JsonValue | null
    materials: JsonValue | null
    textures: JsonValue | null
    arReady: boolean
    arChecks: JsonValue | null
    snapshots: JsonValue | null
    qcIssues: JsonValue | null
    drawCalls: number | null
    perfBudget: JsonValue | null
    createdAt: Date
    updatedAt: Date
    _count: ThreeDAssetCountAggregateOutputType | null
    _avg: ThreeDAssetAvgAggregateOutputType | null
    _sum: ThreeDAssetSumAggregateOutputType | null
    _min: ThreeDAssetMinAggregateOutputType | null
    _max: ThreeDAssetMaxAggregateOutputType | null
  }

  type GetThreeDAssetGroupByPayload<T extends ThreeDAssetGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ThreeDAssetGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ThreeDAssetGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ThreeDAssetGroupByOutputType[P]>
            : GetScalarType<T[P], ThreeDAssetGroupByOutputType[P]>
        }
      >
    >


  export type ThreeDAssetSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    assetId?: boolean
    glbKey?: boolean
    usdzKey?: boolean
    triCount?: boolean
    nodeCount?: boolean
    materialCount?: boolean
    textureCount?: boolean
    widthM?: boolean
    heightM?: boolean
    depthM?: boolean
    volumeM3?: boolean
    lods?: boolean
    materials?: boolean
    textures?: boolean
    arReady?: boolean
    arChecks?: boolean
    snapshots?: boolean
    qcIssues?: boolean
    drawCalls?: boolean
    perfBudget?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["threeDAsset"]>

  export type ThreeDAssetSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    assetId?: boolean
    glbKey?: boolean
    usdzKey?: boolean
    triCount?: boolean
    nodeCount?: boolean
    materialCount?: boolean
    textureCount?: boolean
    widthM?: boolean
    heightM?: boolean
    depthM?: boolean
    volumeM3?: boolean
    lods?: boolean
    materials?: boolean
    textures?: boolean
    arReady?: boolean
    arChecks?: boolean
    snapshots?: boolean
    qcIssues?: boolean
    drawCalls?: boolean
    perfBudget?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["threeDAsset"]>

  export type ThreeDAssetSelectScalar = {
    id?: boolean
    assetId?: boolean
    glbKey?: boolean
    usdzKey?: boolean
    triCount?: boolean
    nodeCount?: boolean
    materialCount?: boolean
    textureCount?: boolean
    widthM?: boolean
    heightM?: boolean
    depthM?: boolean
    volumeM3?: boolean
    lods?: boolean
    materials?: boolean
    textures?: boolean
    arReady?: boolean
    arChecks?: boolean
    snapshots?: boolean
    qcIssues?: boolean
    drawCalls?: boolean
    perfBudget?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type ThreeDAssetInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }
  export type ThreeDAssetIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }

  export type $ThreeDAssetPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ThreeDAsset"
    objects: {
      asset: Prisma.$MediaAssetPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      assetId: string
      glbKey: string | null
      usdzKey: string | null
      triCount: number | null
      nodeCount: number | null
      materialCount: number | null
      textureCount: number | null
      widthM: number | null
      heightM: number | null
      depthM: number | null
      volumeM3: number | null
      lods: Prisma.JsonValue | null
      materials: Prisma.JsonValue | null
      textures: Prisma.JsonValue | null
      arReady: boolean
      arChecks: Prisma.JsonValue | null
      snapshots: Prisma.JsonValue | null
      qcIssues: Prisma.JsonValue | null
      drawCalls: number | null
      perfBudget: Prisma.JsonValue | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["threeDAsset"]>
    composites: {}
  }

  type ThreeDAssetGetPayload<S extends boolean | null | undefined | ThreeDAssetDefaultArgs> = $Result.GetResult<Prisma.$ThreeDAssetPayload, S>

  type ThreeDAssetCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<ThreeDAssetFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: ThreeDAssetCountAggregateInputType | true
    }

  export interface ThreeDAssetDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ThreeDAsset'], meta: { name: 'ThreeDAsset' } }
    /**
     * Find zero or one ThreeDAsset that matches the filter.
     * @param {ThreeDAssetFindUniqueArgs} args - Arguments to find a ThreeDAsset
     * @example
     * // Get one ThreeDAsset
     * const threeDAsset = await prisma.threeDAsset.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ThreeDAssetFindUniqueArgs>(args: SelectSubset<T, ThreeDAssetFindUniqueArgs<ExtArgs>>): Prisma__ThreeDAssetClient<$Result.GetResult<Prisma.$ThreeDAssetPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one ThreeDAsset that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {ThreeDAssetFindUniqueOrThrowArgs} args - Arguments to find a ThreeDAsset
     * @example
     * // Get one ThreeDAsset
     * const threeDAsset = await prisma.threeDAsset.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ThreeDAssetFindUniqueOrThrowArgs>(args: SelectSubset<T, ThreeDAssetFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ThreeDAssetClient<$Result.GetResult<Prisma.$ThreeDAssetPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first ThreeDAsset that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreeDAssetFindFirstArgs} args - Arguments to find a ThreeDAsset
     * @example
     * // Get one ThreeDAsset
     * const threeDAsset = await prisma.threeDAsset.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ThreeDAssetFindFirstArgs>(args?: SelectSubset<T, ThreeDAssetFindFirstArgs<ExtArgs>>): Prisma__ThreeDAssetClient<$Result.GetResult<Prisma.$ThreeDAssetPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first ThreeDAsset that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreeDAssetFindFirstOrThrowArgs} args - Arguments to find a ThreeDAsset
     * @example
     * // Get one ThreeDAsset
     * const threeDAsset = await prisma.threeDAsset.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ThreeDAssetFindFirstOrThrowArgs>(args?: SelectSubset<T, ThreeDAssetFindFirstOrThrowArgs<ExtArgs>>): Prisma__ThreeDAssetClient<$Result.GetResult<Prisma.$ThreeDAssetPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more ThreeDAssets that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreeDAssetFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ThreeDAssets
     * const threeDAssets = await prisma.threeDAsset.findMany()
     * 
     * // Get first 10 ThreeDAssets
     * const threeDAssets = await prisma.threeDAsset.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const threeDAssetWithIdOnly = await prisma.threeDAsset.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ThreeDAssetFindManyArgs>(args?: SelectSubset<T, ThreeDAssetFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ThreeDAssetPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a ThreeDAsset.
     * @param {ThreeDAssetCreateArgs} args - Arguments to create a ThreeDAsset.
     * @example
     * // Create one ThreeDAsset
     * const ThreeDAsset = await prisma.threeDAsset.create({
     *   data: {
     *     // ... data to create a ThreeDAsset
     *   }
     * })
     * 
     */
    create<T extends ThreeDAssetCreateArgs>(args: SelectSubset<T, ThreeDAssetCreateArgs<ExtArgs>>): Prisma__ThreeDAssetClient<$Result.GetResult<Prisma.$ThreeDAssetPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many ThreeDAssets.
     * @param {ThreeDAssetCreateManyArgs} args - Arguments to create many ThreeDAssets.
     * @example
     * // Create many ThreeDAssets
     * const threeDAsset = await prisma.threeDAsset.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ThreeDAssetCreateManyArgs>(args?: SelectSubset<T, ThreeDAssetCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ThreeDAssets and returns the data saved in the database.
     * @param {ThreeDAssetCreateManyAndReturnArgs} args - Arguments to create many ThreeDAssets.
     * @example
     * // Create many ThreeDAssets
     * const threeDAsset = await prisma.threeDAsset.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ThreeDAssets and only return the `id`
     * const threeDAssetWithIdOnly = await prisma.threeDAsset.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ThreeDAssetCreateManyAndReturnArgs>(args?: SelectSubset<T, ThreeDAssetCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ThreeDAssetPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a ThreeDAsset.
     * @param {ThreeDAssetDeleteArgs} args - Arguments to delete one ThreeDAsset.
     * @example
     * // Delete one ThreeDAsset
     * const ThreeDAsset = await prisma.threeDAsset.delete({
     *   where: {
     *     // ... filter to delete one ThreeDAsset
     *   }
     * })
     * 
     */
    delete<T extends ThreeDAssetDeleteArgs>(args: SelectSubset<T, ThreeDAssetDeleteArgs<ExtArgs>>): Prisma__ThreeDAssetClient<$Result.GetResult<Prisma.$ThreeDAssetPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one ThreeDAsset.
     * @param {ThreeDAssetUpdateArgs} args - Arguments to update one ThreeDAsset.
     * @example
     * // Update one ThreeDAsset
     * const threeDAsset = await prisma.threeDAsset.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ThreeDAssetUpdateArgs>(args: SelectSubset<T, ThreeDAssetUpdateArgs<ExtArgs>>): Prisma__ThreeDAssetClient<$Result.GetResult<Prisma.$ThreeDAssetPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more ThreeDAssets.
     * @param {ThreeDAssetDeleteManyArgs} args - Arguments to filter ThreeDAssets to delete.
     * @example
     * // Delete a few ThreeDAssets
     * const { count } = await prisma.threeDAsset.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ThreeDAssetDeleteManyArgs>(args?: SelectSubset<T, ThreeDAssetDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ThreeDAssets.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreeDAssetUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ThreeDAssets
     * const threeDAsset = await prisma.threeDAsset.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ThreeDAssetUpdateManyArgs>(args: SelectSubset<T, ThreeDAssetUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one ThreeDAsset.
     * @param {ThreeDAssetUpsertArgs} args - Arguments to update or create a ThreeDAsset.
     * @example
     * // Update or create a ThreeDAsset
     * const threeDAsset = await prisma.threeDAsset.upsert({
     *   create: {
     *     // ... data to create a ThreeDAsset
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ThreeDAsset we want to update
     *   }
     * })
     */
    upsert<T extends ThreeDAssetUpsertArgs>(args: SelectSubset<T, ThreeDAssetUpsertArgs<ExtArgs>>): Prisma__ThreeDAssetClient<$Result.GetResult<Prisma.$ThreeDAssetPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of ThreeDAssets.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreeDAssetCountArgs} args - Arguments to filter ThreeDAssets to count.
     * @example
     * // Count the number of ThreeDAssets
     * const count = await prisma.threeDAsset.count({
     *   where: {
     *     // ... the filter for the ThreeDAssets we want to count
     *   }
     * })
    **/
    count<T extends ThreeDAssetCountArgs>(
      args?: Subset<T, ThreeDAssetCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ThreeDAssetCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ThreeDAsset.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreeDAssetAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ThreeDAssetAggregateArgs>(args: Subset<T, ThreeDAssetAggregateArgs>): Prisma.PrismaPromise<GetThreeDAssetAggregateType<T>>

    /**
     * Group by ThreeDAsset.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ThreeDAssetGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ThreeDAssetGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ThreeDAssetGroupByArgs['orderBy'] }
        : { orderBy?: ThreeDAssetGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ThreeDAssetGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetThreeDAssetGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ThreeDAsset model
   */
  readonly fields: ThreeDAssetFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ThreeDAsset.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ThreeDAssetClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    asset<T extends MediaAssetDefaultArgs<ExtArgs> = {}>(args?: Subset<T, MediaAssetDefaultArgs<ExtArgs>>): Prisma__MediaAssetClient<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ThreeDAsset model
   */ 
  interface ThreeDAssetFieldRefs {
    readonly id: FieldRef<"ThreeDAsset", 'String'>
    readonly assetId: FieldRef<"ThreeDAsset", 'String'>
    readonly glbKey: FieldRef<"ThreeDAsset", 'String'>
    readonly usdzKey: FieldRef<"ThreeDAsset", 'String'>
    readonly triCount: FieldRef<"ThreeDAsset", 'Int'>
    readonly nodeCount: FieldRef<"ThreeDAsset", 'Int'>
    readonly materialCount: FieldRef<"ThreeDAsset", 'Int'>
    readonly textureCount: FieldRef<"ThreeDAsset", 'Int'>
    readonly widthM: FieldRef<"ThreeDAsset", 'Float'>
    readonly heightM: FieldRef<"ThreeDAsset", 'Float'>
    readonly depthM: FieldRef<"ThreeDAsset", 'Float'>
    readonly volumeM3: FieldRef<"ThreeDAsset", 'Float'>
    readonly lods: FieldRef<"ThreeDAsset", 'Json'>
    readonly materials: FieldRef<"ThreeDAsset", 'Json'>
    readonly textures: FieldRef<"ThreeDAsset", 'Json'>
    readonly arReady: FieldRef<"ThreeDAsset", 'Boolean'>
    readonly arChecks: FieldRef<"ThreeDAsset", 'Json'>
    readonly snapshots: FieldRef<"ThreeDAsset", 'Json'>
    readonly qcIssues: FieldRef<"ThreeDAsset", 'Json'>
    readonly drawCalls: FieldRef<"ThreeDAsset", 'Int'>
    readonly perfBudget: FieldRef<"ThreeDAsset", 'Json'>
    readonly createdAt: FieldRef<"ThreeDAsset", 'DateTime'>
    readonly updatedAt: FieldRef<"ThreeDAsset", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ThreeDAsset findUnique
   */
  export type ThreeDAssetFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetInclude<ExtArgs> | null
    /**
     * Filter, which ThreeDAsset to fetch.
     */
    where: ThreeDAssetWhereUniqueInput
  }

  /**
   * ThreeDAsset findUniqueOrThrow
   */
  export type ThreeDAssetFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetInclude<ExtArgs> | null
    /**
     * Filter, which ThreeDAsset to fetch.
     */
    where: ThreeDAssetWhereUniqueInput
  }

  /**
   * ThreeDAsset findFirst
   */
  export type ThreeDAssetFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetInclude<ExtArgs> | null
    /**
     * Filter, which ThreeDAsset to fetch.
     */
    where?: ThreeDAssetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ThreeDAssets to fetch.
     */
    orderBy?: ThreeDAssetOrderByWithRelationInput | ThreeDAssetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ThreeDAssets.
     */
    cursor?: ThreeDAssetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ThreeDAssets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ThreeDAssets.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ThreeDAssets.
     */
    distinct?: ThreeDAssetScalarFieldEnum | ThreeDAssetScalarFieldEnum[]
  }

  /**
   * ThreeDAsset findFirstOrThrow
   */
  export type ThreeDAssetFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetInclude<ExtArgs> | null
    /**
     * Filter, which ThreeDAsset to fetch.
     */
    where?: ThreeDAssetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ThreeDAssets to fetch.
     */
    orderBy?: ThreeDAssetOrderByWithRelationInput | ThreeDAssetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ThreeDAssets.
     */
    cursor?: ThreeDAssetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ThreeDAssets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ThreeDAssets.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ThreeDAssets.
     */
    distinct?: ThreeDAssetScalarFieldEnum | ThreeDAssetScalarFieldEnum[]
  }

  /**
   * ThreeDAsset findMany
   */
  export type ThreeDAssetFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetInclude<ExtArgs> | null
    /**
     * Filter, which ThreeDAssets to fetch.
     */
    where?: ThreeDAssetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ThreeDAssets to fetch.
     */
    orderBy?: ThreeDAssetOrderByWithRelationInput | ThreeDAssetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ThreeDAssets.
     */
    cursor?: ThreeDAssetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ThreeDAssets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ThreeDAssets.
     */
    skip?: number
    distinct?: ThreeDAssetScalarFieldEnum | ThreeDAssetScalarFieldEnum[]
  }

  /**
   * ThreeDAsset create
   */
  export type ThreeDAssetCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetInclude<ExtArgs> | null
    /**
     * The data needed to create a ThreeDAsset.
     */
    data: XOR<ThreeDAssetCreateInput, ThreeDAssetUncheckedCreateInput>
  }

  /**
   * ThreeDAsset createMany
   */
  export type ThreeDAssetCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ThreeDAssets.
     */
    data: ThreeDAssetCreateManyInput | ThreeDAssetCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ThreeDAsset createManyAndReturn
   */
  export type ThreeDAssetCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many ThreeDAssets.
     */
    data: ThreeDAssetCreateManyInput | ThreeDAssetCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * ThreeDAsset update
   */
  export type ThreeDAssetUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetInclude<ExtArgs> | null
    /**
     * The data needed to update a ThreeDAsset.
     */
    data: XOR<ThreeDAssetUpdateInput, ThreeDAssetUncheckedUpdateInput>
    /**
     * Choose, which ThreeDAsset to update.
     */
    where: ThreeDAssetWhereUniqueInput
  }

  /**
   * ThreeDAsset updateMany
   */
  export type ThreeDAssetUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ThreeDAssets.
     */
    data: XOR<ThreeDAssetUpdateManyMutationInput, ThreeDAssetUncheckedUpdateManyInput>
    /**
     * Filter which ThreeDAssets to update
     */
    where?: ThreeDAssetWhereInput
  }

  /**
   * ThreeDAsset upsert
   */
  export type ThreeDAssetUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetInclude<ExtArgs> | null
    /**
     * The filter to search for the ThreeDAsset to update in case it exists.
     */
    where: ThreeDAssetWhereUniqueInput
    /**
     * In case the ThreeDAsset found by the `where` argument doesn't exist, create a new ThreeDAsset with this data.
     */
    create: XOR<ThreeDAssetCreateInput, ThreeDAssetUncheckedCreateInput>
    /**
     * In case the ThreeDAsset was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ThreeDAssetUpdateInput, ThreeDAssetUncheckedUpdateInput>
  }

  /**
   * ThreeDAsset delete
   */
  export type ThreeDAssetDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetInclude<ExtArgs> | null
    /**
     * Filter which ThreeDAsset to delete.
     */
    where: ThreeDAssetWhereUniqueInput
  }

  /**
   * ThreeDAsset deleteMany
   */
  export type ThreeDAssetDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ThreeDAssets to delete
     */
    where?: ThreeDAssetWhereInput
  }

  /**
   * ThreeDAsset without action
   */
  export type ThreeDAssetDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ThreeDAsset
     */
    select?: ThreeDAssetSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ThreeDAssetInclude<ExtArgs> | null
  }


  /**
   * Model ProcessJob
   */

  export type AggregateProcessJob = {
    _count: ProcessJobCountAggregateOutputType | null
    _avg: ProcessJobAvgAggregateOutputType | null
    _sum: ProcessJobSumAggregateOutputType | null
    _min: ProcessJobMinAggregateOutputType | null
    _max: ProcessJobMaxAggregateOutputType | null
  }

  export type ProcessJobAvgAggregateOutputType = {
    priority: number | null
    attempts: number | null
    maxRetries: number | null
  }

  export type ProcessJobSumAggregateOutputType = {
    priority: number | null
    attempts: number | null
    maxRetries: number | null
  }

  export type ProcessJobMinAggregateOutputType = {
    id: string | null
    assetId: string | null
    type: $Enums.JobType | null
    state: $Enums.JobState | null
    priority: number | null
    attempts: number | null
    maxRetries: number | null
    error: string | null
    errorCode: string | null
    queuedAt: Date | null
    startedAt: Date | null
    finishedAt: Date | null
    workerId: string | null
  }

  export type ProcessJobMaxAggregateOutputType = {
    id: string | null
    assetId: string | null
    type: $Enums.JobType | null
    state: $Enums.JobState | null
    priority: number | null
    attempts: number | null
    maxRetries: number | null
    error: string | null
    errorCode: string | null
    queuedAt: Date | null
    startedAt: Date | null
    finishedAt: Date | null
    workerId: string | null
  }

  export type ProcessJobCountAggregateOutputType = {
    id: number
    assetId: number
    type: number
    state: number
    priority: number
    attempts: number
    maxRetries: number
    error: number
    errorCode: number
    queuedAt: number
    startedAt: number
    finishedAt: number
    meta: number
    result: number
    workerId: number
    _all: number
  }


  export type ProcessJobAvgAggregateInputType = {
    priority?: true
    attempts?: true
    maxRetries?: true
  }

  export type ProcessJobSumAggregateInputType = {
    priority?: true
    attempts?: true
    maxRetries?: true
  }

  export type ProcessJobMinAggregateInputType = {
    id?: true
    assetId?: true
    type?: true
    state?: true
    priority?: true
    attempts?: true
    maxRetries?: true
    error?: true
    errorCode?: true
    queuedAt?: true
    startedAt?: true
    finishedAt?: true
    workerId?: true
  }

  export type ProcessJobMaxAggregateInputType = {
    id?: true
    assetId?: true
    type?: true
    state?: true
    priority?: true
    attempts?: true
    maxRetries?: true
    error?: true
    errorCode?: true
    queuedAt?: true
    startedAt?: true
    finishedAt?: true
    workerId?: true
  }

  export type ProcessJobCountAggregateInputType = {
    id?: true
    assetId?: true
    type?: true
    state?: true
    priority?: true
    attempts?: true
    maxRetries?: true
    error?: true
    errorCode?: true
    queuedAt?: true
    startedAt?: true
    finishedAt?: true
    meta?: true
    result?: true
    workerId?: true
    _all?: true
  }

  export type ProcessJobAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ProcessJob to aggregate.
     */
    where?: ProcessJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ProcessJobs to fetch.
     */
    orderBy?: ProcessJobOrderByWithRelationInput | ProcessJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ProcessJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ProcessJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ProcessJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ProcessJobs
    **/
    _count?: true | ProcessJobCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ProcessJobAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ProcessJobSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ProcessJobMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ProcessJobMaxAggregateInputType
  }

  export type GetProcessJobAggregateType<T extends ProcessJobAggregateArgs> = {
        [P in keyof T & keyof AggregateProcessJob]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateProcessJob[P]>
      : GetScalarType<T[P], AggregateProcessJob[P]>
  }




  export type ProcessJobGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ProcessJobWhereInput
    orderBy?: ProcessJobOrderByWithAggregationInput | ProcessJobOrderByWithAggregationInput[]
    by: ProcessJobScalarFieldEnum[] | ProcessJobScalarFieldEnum
    having?: ProcessJobScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ProcessJobCountAggregateInputType | true
    _avg?: ProcessJobAvgAggregateInputType
    _sum?: ProcessJobSumAggregateInputType
    _min?: ProcessJobMinAggregateInputType
    _max?: ProcessJobMaxAggregateInputType
  }

  export type ProcessJobGroupByOutputType = {
    id: string
    assetId: string
    type: $Enums.JobType
    state: $Enums.JobState
    priority: number
    attempts: number
    maxRetries: number
    error: string | null
    errorCode: string | null
    queuedAt: Date
    startedAt: Date | null
    finishedAt: Date | null
    meta: JsonValue | null
    result: JsonValue | null
    workerId: string | null
    _count: ProcessJobCountAggregateOutputType | null
    _avg: ProcessJobAvgAggregateOutputType | null
    _sum: ProcessJobSumAggregateOutputType | null
    _min: ProcessJobMinAggregateOutputType | null
    _max: ProcessJobMaxAggregateOutputType | null
  }

  type GetProcessJobGroupByPayload<T extends ProcessJobGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ProcessJobGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ProcessJobGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ProcessJobGroupByOutputType[P]>
            : GetScalarType<T[P], ProcessJobGroupByOutputType[P]>
        }
      >
    >


  export type ProcessJobSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    assetId?: boolean
    type?: boolean
    state?: boolean
    priority?: boolean
    attempts?: boolean
    maxRetries?: boolean
    error?: boolean
    errorCode?: boolean
    queuedAt?: boolean
    startedAt?: boolean
    finishedAt?: boolean
    meta?: boolean
    result?: boolean
    workerId?: boolean
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["processJob"]>

  export type ProcessJobSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    assetId?: boolean
    type?: boolean
    state?: boolean
    priority?: boolean
    attempts?: boolean
    maxRetries?: boolean
    error?: boolean
    errorCode?: boolean
    queuedAt?: boolean
    startedAt?: boolean
    finishedAt?: boolean
    meta?: boolean
    result?: boolean
    workerId?: boolean
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["processJob"]>

  export type ProcessJobSelectScalar = {
    id?: boolean
    assetId?: boolean
    type?: boolean
    state?: boolean
    priority?: boolean
    attempts?: boolean
    maxRetries?: boolean
    error?: boolean
    errorCode?: boolean
    queuedAt?: boolean
    startedAt?: boolean
    finishedAt?: boolean
    meta?: boolean
    result?: boolean
    workerId?: boolean
  }

  export type ProcessJobInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }
  export type ProcessJobIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    asset?: boolean | MediaAssetDefaultArgs<ExtArgs>
  }

  export type $ProcessJobPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ProcessJob"
    objects: {
      asset: Prisma.$MediaAssetPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      assetId: string
      type: $Enums.JobType
      state: $Enums.JobState
      priority: number
      attempts: number
      maxRetries: number
      error: string | null
      errorCode: string | null
      queuedAt: Date
      startedAt: Date | null
      finishedAt: Date | null
      meta: Prisma.JsonValue | null
      result: Prisma.JsonValue | null
      workerId: string | null
    }, ExtArgs["result"]["processJob"]>
    composites: {}
  }

  type ProcessJobGetPayload<S extends boolean | null | undefined | ProcessJobDefaultArgs> = $Result.GetResult<Prisma.$ProcessJobPayload, S>

  type ProcessJobCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<ProcessJobFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: ProcessJobCountAggregateInputType | true
    }

  export interface ProcessJobDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ProcessJob'], meta: { name: 'ProcessJob' } }
    /**
     * Find zero or one ProcessJob that matches the filter.
     * @param {ProcessJobFindUniqueArgs} args - Arguments to find a ProcessJob
     * @example
     * // Get one ProcessJob
     * const processJob = await prisma.processJob.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ProcessJobFindUniqueArgs>(args: SelectSubset<T, ProcessJobFindUniqueArgs<ExtArgs>>): Prisma__ProcessJobClient<$Result.GetResult<Prisma.$ProcessJobPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one ProcessJob that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {ProcessJobFindUniqueOrThrowArgs} args - Arguments to find a ProcessJob
     * @example
     * // Get one ProcessJob
     * const processJob = await prisma.processJob.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ProcessJobFindUniqueOrThrowArgs>(args: SelectSubset<T, ProcessJobFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ProcessJobClient<$Result.GetResult<Prisma.$ProcessJobPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first ProcessJob that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProcessJobFindFirstArgs} args - Arguments to find a ProcessJob
     * @example
     * // Get one ProcessJob
     * const processJob = await prisma.processJob.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ProcessJobFindFirstArgs>(args?: SelectSubset<T, ProcessJobFindFirstArgs<ExtArgs>>): Prisma__ProcessJobClient<$Result.GetResult<Prisma.$ProcessJobPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first ProcessJob that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProcessJobFindFirstOrThrowArgs} args - Arguments to find a ProcessJob
     * @example
     * // Get one ProcessJob
     * const processJob = await prisma.processJob.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ProcessJobFindFirstOrThrowArgs>(args?: SelectSubset<T, ProcessJobFindFirstOrThrowArgs<ExtArgs>>): Prisma__ProcessJobClient<$Result.GetResult<Prisma.$ProcessJobPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more ProcessJobs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProcessJobFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ProcessJobs
     * const processJobs = await prisma.processJob.findMany()
     * 
     * // Get first 10 ProcessJobs
     * const processJobs = await prisma.processJob.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const processJobWithIdOnly = await prisma.processJob.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ProcessJobFindManyArgs>(args?: SelectSubset<T, ProcessJobFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ProcessJobPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a ProcessJob.
     * @param {ProcessJobCreateArgs} args - Arguments to create a ProcessJob.
     * @example
     * // Create one ProcessJob
     * const ProcessJob = await prisma.processJob.create({
     *   data: {
     *     // ... data to create a ProcessJob
     *   }
     * })
     * 
     */
    create<T extends ProcessJobCreateArgs>(args: SelectSubset<T, ProcessJobCreateArgs<ExtArgs>>): Prisma__ProcessJobClient<$Result.GetResult<Prisma.$ProcessJobPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many ProcessJobs.
     * @param {ProcessJobCreateManyArgs} args - Arguments to create many ProcessJobs.
     * @example
     * // Create many ProcessJobs
     * const processJob = await prisma.processJob.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ProcessJobCreateManyArgs>(args?: SelectSubset<T, ProcessJobCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ProcessJobs and returns the data saved in the database.
     * @param {ProcessJobCreateManyAndReturnArgs} args - Arguments to create many ProcessJobs.
     * @example
     * // Create many ProcessJobs
     * const processJob = await prisma.processJob.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ProcessJobs and only return the `id`
     * const processJobWithIdOnly = await prisma.processJob.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ProcessJobCreateManyAndReturnArgs>(args?: SelectSubset<T, ProcessJobCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ProcessJobPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a ProcessJob.
     * @param {ProcessJobDeleteArgs} args - Arguments to delete one ProcessJob.
     * @example
     * // Delete one ProcessJob
     * const ProcessJob = await prisma.processJob.delete({
     *   where: {
     *     // ... filter to delete one ProcessJob
     *   }
     * })
     * 
     */
    delete<T extends ProcessJobDeleteArgs>(args: SelectSubset<T, ProcessJobDeleteArgs<ExtArgs>>): Prisma__ProcessJobClient<$Result.GetResult<Prisma.$ProcessJobPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one ProcessJob.
     * @param {ProcessJobUpdateArgs} args - Arguments to update one ProcessJob.
     * @example
     * // Update one ProcessJob
     * const processJob = await prisma.processJob.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ProcessJobUpdateArgs>(args: SelectSubset<T, ProcessJobUpdateArgs<ExtArgs>>): Prisma__ProcessJobClient<$Result.GetResult<Prisma.$ProcessJobPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more ProcessJobs.
     * @param {ProcessJobDeleteManyArgs} args - Arguments to filter ProcessJobs to delete.
     * @example
     * // Delete a few ProcessJobs
     * const { count } = await prisma.processJob.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ProcessJobDeleteManyArgs>(args?: SelectSubset<T, ProcessJobDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ProcessJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProcessJobUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ProcessJobs
     * const processJob = await prisma.processJob.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ProcessJobUpdateManyArgs>(args: SelectSubset<T, ProcessJobUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one ProcessJob.
     * @param {ProcessJobUpsertArgs} args - Arguments to update or create a ProcessJob.
     * @example
     * // Update or create a ProcessJob
     * const processJob = await prisma.processJob.upsert({
     *   create: {
     *     // ... data to create a ProcessJob
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ProcessJob we want to update
     *   }
     * })
     */
    upsert<T extends ProcessJobUpsertArgs>(args: SelectSubset<T, ProcessJobUpsertArgs<ExtArgs>>): Prisma__ProcessJobClient<$Result.GetResult<Prisma.$ProcessJobPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of ProcessJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProcessJobCountArgs} args - Arguments to filter ProcessJobs to count.
     * @example
     * // Count the number of ProcessJobs
     * const count = await prisma.processJob.count({
     *   where: {
     *     // ... the filter for the ProcessJobs we want to count
     *   }
     * })
    **/
    count<T extends ProcessJobCountArgs>(
      args?: Subset<T, ProcessJobCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ProcessJobCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ProcessJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProcessJobAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ProcessJobAggregateArgs>(args: Subset<T, ProcessJobAggregateArgs>): Prisma.PrismaPromise<GetProcessJobAggregateType<T>>

    /**
     * Group by ProcessJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProcessJobGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ProcessJobGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ProcessJobGroupByArgs['orderBy'] }
        : { orderBy?: ProcessJobGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ProcessJobGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetProcessJobGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ProcessJob model
   */
  readonly fields: ProcessJobFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ProcessJob.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ProcessJobClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    asset<T extends MediaAssetDefaultArgs<ExtArgs> = {}>(args?: Subset<T, MediaAssetDefaultArgs<ExtArgs>>): Prisma__MediaAssetClient<$Result.GetResult<Prisma.$MediaAssetPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ProcessJob model
   */ 
  interface ProcessJobFieldRefs {
    readonly id: FieldRef<"ProcessJob", 'String'>
    readonly assetId: FieldRef<"ProcessJob", 'String'>
    readonly type: FieldRef<"ProcessJob", 'JobType'>
    readonly state: FieldRef<"ProcessJob", 'JobState'>
    readonly priority: FieldRef<"ProcessJob", 'Int'>
    readonly attempts: FieldRef<"ProcessJob", 'Int'>
    readonly maxRetries: FieldRef<"ProcessJob", 'Int'>
    readonly error: FieldRef<"ProcessJob", 'String'>
    readonly errorCode: FieldRef<"ProcessJob", 'String'>
    readonly queuedAt: FieldRef<"ProcessJob", 'DateTime'>
    readonly startedAt: FieldRef<"ProcessJob", 'DateTime'>
    readonly finishedAt: FieldRef<"ProcessJob", 'DateTime'>
    readonly meta: FieldRef<"ProcessJob", 'Json'>
    readonly result: FieldRef<"ProcessJob", 'Json'>
    readonly workerId: FieldRef<"ProcessJob", 'String'>
  }
    

  // Custom InputTypes
  /**
   * ProcessJob findUnique
   */
  export type ProcessJobFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobInclude<ExtArgs> | null
    /**
     * Filter, which ProcessJob to fetch.
     */
    where: ProcessJobWhereUniqueInput
  }

  /**
   * ProcessJob findUniqueOrThrow
   */
  export type ProcessJobFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobInclude<ExtArgs> | null
    /**
     * Filter, which ProcessJob to fetch.
     */
    where: ProcessJobWhereUniqueInput
  }

  /**
   * ProcessJob findFirst
   */
  export type ProcessJobFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobInclude<ExtArgs> | null
    /**
     * Filter, which ProcessJob to fetch.
     */
    where?: ProcessJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ProcessJobs to fetch.
     */
    orderBy?: ProcessJobOrderByWithRelationInput | ProcessJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ProcessJobs.
     */
    cursor?: ProcessJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ProcessJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ProcessJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ProcessJobs.
     */
    distinct?: ProcessJobScalarFieldEnum | ProcessJobScalarFieldEnum[]
  }

  /**
   * ProcessJob findFirstOrThrow
   */
  export type ProcessJobFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobInclude<ExtArgs> | null
    /**
     * Filter, which ProcessJob to fetch.
     */
    where?: ProcessJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ProcessJobs to fetch.
     */
    orderBy?: ProcessJobOrderByWithRelationInput | ProcessJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ProcessJobs.
     */
    cursor?: ProcessJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ProcessJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ProcessJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ProcessJobs.
     */
    distinct?: ProcessJobScalarFieldEnum | ProcessJobScalarFieldEnum[]
  }

  /**
   * ProcessJob findMany
   */
  export type ProcessJobFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobInclude<ExtArgs> | null
    /**
     * Filter, which ProcessJobs to fetch.
     */
    where?: ProcessJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ProcessJobs to fetch.
     */
    orderBy?: ProcessJobOrderByWithRelationInput | ProcessJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ProcessJobs.
     */
    cursor?: ProcessJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ProcessJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ProcessJobs.
     */
    skip?: number
    distinct?: ProcessJobScalarFieldEnum | ProcessJobScalarFieldEnum[]
  }

  /**
   * ProcessJob create
   */
  export type ProcessJobCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobInclude<ExtArgs> | null
    /**
     * The data needed to create a ProcessJob.
     */
    data: XOR<ProcessJobCreateInput, ProcessJobUncheckedCreateInput>
  }

  /**
   * ProcessJob createMany
   */
  export type ProcessJobCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ProcessJobs.
     */
    data: ProcessJobCreateManyInput | ProcessJobCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ProcessJob createManyAndReturn
   */
  export type ProcessJobCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many ProcessJobs.
     */
    data: ProcessJobCreateManyInput | ProcessJobCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * ProcessJob update
   */
  export type ProcessJobUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobInclude<ExtArgs> | null
    /**
     * The data needed to update a ProcessJob.
     */
    data: XOR<ProcessJobUpdateInput, ProcessJobUncheckedUpdateInput>
    /**
     * Choose, which ProcessJob to update.
     */
    where: ProcessJobWhereUniqueInput
  }

  /**
   * ProcessJob updateMany
   */
  export type ProcessJobUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ProcessJobs.
     */
    data: XOR<ProcessJobUpdateManyMutationInput, ProcessJobUncheckedUpdateManyInput>
    /**
     * Filter which ProcessJobs to update
     */
    where?: ProcessJobWhereInput
  }

  /**
   * ProcessJob upsert
   */
  export type ProcessJobUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobInclude<ExtArgs> | null
    /**
     * The filter to search for the ProcessJob to update in case it exists.
     */
    where: ProcessJobWhereUniqueInput
    /**
     * In case the ProcessJob found by the `where` argument doesn't exist, create a new ProcessJob with this data.
     */
    create: XOR<ProcessJobCreateInput, ProcessJobUncheckedCreateInput>
    /**
     * In case the ProcessJob was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ProcessJobUpdateInput, ProcessJobUncheckedUpdateInput>
  }

  /**
   * ProcessJob delete
   */
  export type ProcessJobDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobInclude<ExtArgs> | null
    /**
     * Filter which ProcessJob to delete.
     */
    where: ProcessJobWhereUniqueInput
  }

  /**
   * ProcessJob deleteMany
   */
  export type ProcessJobDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ProcessJobs to delete
     */
    where?: ProcessJobWhereInput
  }

  /**
   * ProcessJob without action
   */
  export type ProcessJobDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProcessJob
     */
    select?: ProcessJobSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ProcessJobInclude<ExtArgs> | null
  }


  /**
   * Model UploadSession
   */

  export type AggregateUploadSession = {
    _count: UploadSessionCountAggregateOutputType | null
    _avg: UploadSessionAvgAggregateOutputType | null
    _sum: UploadSessionSumAggregateOutputType | null
    _min: UploadSessionMinAggregateOutputType | null
    _max: UploadSessionMaxAggregateOutputType | null
  }

  export type UploadSessionAvgAggregateOutputType = {
    fileSize: number | null
  }

  export type UploadSessionSumAggregateOutputType = {
    fileSize: number | null
  }

  export type UploadSessionMinAggregateOutputType = {
    id: string | null
    assetId: string | null
    filename: string | null
    fileSize: number | null
    mimeType: string | null
    kind: $Enums.AssetKind | null
    parUrl: string | null
    targetKey: string | null
    expiresAt: Date | null
    status: $Enums.UploadStatus | null
    uploadedAt: Date | null
    userId: string | null
    productId: string | null
    variantId: string | null
    role: $Enums.AssetRole | null
    idempotencyKey: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UploadSessionMaxAggregateOutputType = {
    id: string | null
    assetId: string | null
    filename: string | null
    fileSize: number | null
    mimeType: string | null
    kind: $Enums.AssetKind | null
    parUrl: string | null
    targetKey: string | null
    expiresAt: Date | null
    status: $Enums.UploadStatus | null
    uploadedAt: Date | null
    userId: string | null
    productId: string | null
    variantId: string | null
    role: $Enums.AssetRole | null
    idempotencyKey: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UploadSessionCountAggregateOutputType = {
    id: number
    assetId: number
    filename: number
    fileSize: number
    mimeType: number
    kind: number
    parUrl: number
    targetKey: number
    expiresAt: number
    status: number
    uploadedAt: number
    userId: number
    productId: number
    variantId: number
    role: number
    idempotencyKey: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type UploadSessionAvgAggregateInputType = {
    fileSize?: true
  }

  export type UploadSessionSumAggregateInputType = {
    fileSize?: true
  }

  export type UploadSessionMinAggregateInputType = {
    id?: true
    assetId?: true
    filename?: true
    fileSize?: true
    mimeType?: true
    kind?: true
    parUrl?: true
    targetKey?: true
    expiresAt?: true
    status?: true
    uploadedAt?: true
    userId?: true
    productId?: true
    variantId?: true
    role?: true
    idempotencyKey?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UploadSessionMaxAggregateInputType = {
    id?: true
    assetId?: true
    filename?: true
    fileSize?: true
    mimeType?: true
    kind?: true
    parUrl?: true
    targetKey?: true
    expiresAt?: true
    status?: true
    uploadedAt?: true
    userId?: true
    productId?: true
    variantId?: true
    role?: true
    idempotencyKey?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UploadSessionCountAggregateInputType = {
    id?: true
    assetId?: true
    filename?: true
    fileSize?: true
    mimeType?: true
    kind?: true
    parUrl?: true
    targetKey?: true
    expiresAt?: true
    status?: true
    uploadedAt?: true
    userId?: true
    productId?: true
    variantId?: true
    role?: true
    idempotencyKey?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type UploadSessionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which UploadSession to aggregate.
     */
    where?: UploadSessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UploadSessions to fetch.
     */
    orderBy?: UploadSessionOrderByWithRelationInput | UploadSessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UploadSessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UploadSessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UploadSessions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned UploadSessions
    **/
    _count?: true | UploadSessionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: UploadSessionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: UploadSessionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UploadSessionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UploadSessionMaxAggregateInputType
  }

  export type GetUploadSessionAggregateType<T extends UploadSessionAggregateArgs> = {
        [P in keyof T & keyof AggregateUploadSession]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUploadSession[P]>
      : GetScalarType<T[P], AggregateUploadSession[P]>
  }




  export type UploadSessionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UploadSessionWhereInput
    orderBy?: UploadSessionOrderByWithAggregationInput | UploadSessionOrderByWithAggregationInput[]
    by: UploadSessionScalarFieldEnum[] | UploadSessionScalarFieldEnum
    having?: UploadSessionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UploadSessionCountAggregateInputType | true
    _avg?: UploadSessionAvgAggregateInputType
    _sum?: UploadSessionSumAggregateInputType
    _min?: UploadSessionMinAggregateInputType
    _max?: UploadSessionMaxAggregateInputType
  }

  export type UploadSessionGroupByOutputType = {
    id: string
    assetId: string | null
    filename: string
    fileSize: number | null
    mimeType: string
    kind: $Enums.AssetKind
    parUrl: string
    targetKey: string
    expiresAt: Date
    status: $Enums.UploadStatus
    uploadedAt: Date | null
    userId: string
    productId: string | null
    variantId: string | null
    role: $Enums.AssetRole | null
    idempotencyKey: string | null
    createdAt: Date
    updatedAt: Date
    _count: UploadSessionCountAggregateOutputType | null
    _avg: UploadSessionAvgAggregateOutputType | null
    _sum: UploadSessionSumAggregateOutputType | null
    _min: UploadSessionMinAggregateOutputType | null
    _max: UploadSessionMaxAggregateOutputType | null
  }

  type GetUploadSessionGroupByPayload<T extends UploadSessionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UploadSessionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UploadSessionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UploadSessionGroupByOutputType[P]>
            : GetScalarType<T[P], UploadSessionGroupByOutputType[P]>
        }
      >
    >


  export type UploadSessionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    assetId?: boolean
    filename?: boolean
    fileSize?: boolean
    mimeType?: boolean
    kind?: boolean
    parUrl?: boolean
    targetKey?: boolean
    expiresAt?: boolean
    status?: boolean
    uploadedAt?: boolean
    userId?: boolean
    productId?: boolean
    variantId?: boolean
    role?: boolean
    idempotencyKey?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["uploadSession"]>

  export type UploadSessionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    assetId?: boolean
    filename?: boolean
    fileSize?: boolean
    mimeType?: boolean
    kind?: boolean
    parUrl?: boolean
    targetKey?: boolean
    expiresAt?: boolean
    status?: boolean
    uploadedAt?: boolean
    userId?: boolean
    productId?: boolean
    variantId?: boolean
    role?: boolean
    idempotencyKey?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["uploadSession"]>

  export type UploadSessionSelectScalar = {
    id?: boolean
    assetId?: boolean
    filename?: boolean
    fileSize?: boolean
    mimeType?: boolean
    kind?: boolean
    parUrl?: boolean
    targetKey?: boolean
    expiresAt?: boolean
    status?: boolean
    uploadedAt?: boolean
    userId?: boolean
    productId?: boolean
    variantId?: boolean
    role?: boolean
    idempotencyKey?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }


  export type $UploadSessionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "UploadSession"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      assetId: string | null
      filename: string
      fileSize: number | null
      mimeType: string
      kind: $Enums.AssetKind
      parUrl: string
      targetKey: string
      expiresAt: Date
      status: $Enums.UploadStatus
      uploadedAt: Date | null
      userId: string
      productId: string | null
      variantId: string | null
      role: $Enums.AssetRole | null
      idempotencyKey: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["uploadSession"]>
    composites: {}
  }

  type UploadSessionGetPayload<S extends boolean | null | undefined | UploadSessionDefaultArgs> = $Result.GetResult<Prisma.$UploadSessionPayload, S>

  type UploadSessionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<UploadSessionFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: UploadSessionCountAggregateInputType | true
    }

  export interface UploadSessionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['UploadSession'], meta: { name: 'UploadSession' } }
    /**
     * Find zero or one UploadSession that matches the filter.
     * @param {UploadSessionFindUniqueArgs} args - Arguments to find a UploadSession
     * @example
     * // Get one UploadSession
     * const uploadSession = await prisma.uploadSession.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UploadSessionFindUniqueArgs>(args: SelectSubset<T, UploadSessionFindUniqueArgs<ExtArgs>>): Prisma__UploadSessionClient<$Result.GetResult<Prisma.$UploadSessionPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one UploadSession that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {UploadSessionFindUniqueOrThrowArgs} args - Arguments to find a UploadSession
     * @example
     * // Get one UploadSession
     * const uploadSession = await prisma.uploadSession.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UploadSessionFindUniqueOrThrowArgs>(args: SelectSubset<T, UploadSessionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UploadSessionClient<$Result.GetResult<Prisma.$UploadSessionPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first UploadSession that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UploadSessionFindFirstArgs} args - Arguments to find a UploadSession
     * @example
     * // Get one UploadSession
     * const uploadSession = await prisma.uploadSession.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UploadSessionFindFirstArgs>(args?: SelectSubset<T, UploadSessionFindFirstArgs<ExtArgs>>): Prisma__UploadSessionClient<$Result.GetResult<Prisma.$UploadSessionPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first UploadSession that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UploadSessionFindFirstOrThrowArgs} args - Arguments to find a UploadSession
     * @example
     * // Get one UploadSession
     * const uploadSession = await prisma.uploadSession.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UploadSessionFindFirstOrThrowArgs>(args?: SelectSubset<T, UploadSessionFindFirstOrThrowArgs<ExtArgs>>): Prisma__UploadSessionClient<$Result.GetResult<Prisma.$UploadSessionPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more UploadSessions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UploadSessionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all UploadSessions
     * const uploadSessions = await prisma.uploadSession.findMany()
     * 
     * // Get first 10 UploadSessions
     * const uploadSessions = await prisma.uploadSession.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const uploadSessionWithIdOnly = await prisma.uploadSession.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UploadSessionFindManyArgs>(args?: SelectSubset<T, UploadSessionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UploadSessionPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a UploadSession.
     * @param {UploadSessionCreateArgs} args - Arguments to create a UploadSession.
     * @example
     * // Create one UploadSession
     * const UploadSession = await prisma.uploadSession.create({
     *   data: {
     *     // ... data to create a UploadSession
     *   }
     * })
     * 
     */
    create<T extends UploadSessionCreateArgs>(args: SelectSubset<T, UploadSessionCreateArgs<ExtArgs>>): Prisma__UploadSessionClient<$Result.GetResult<Prisma.$UploadSessionPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many UploadSessions.
     * @param {UploadSessionCreateManyArgs} args - Arguments to create many UploadSessions.
     * @example
     * // Create many UploadSessions
     * const uploadSession = await prisma.uploadSession.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UploadSessionCreateManyArgs>(args?: SelectSubset<T, UploadSessionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many UploadSessions and returns the data saved in the database.
     * @param {UploadSessionCreateManyAndReturnArgs} args - Arguments to create many UploadSessions.
     * @example
     * // Create many UploadSessions
     * const uploadSession = await prisma.uploadSession.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many UploadSessions and only return the `id`
     * const uploadSessionWithIdOnly = await prisma.uploadSession.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends UploadSessionCreateManyAndReturnArgs>(args?: SelectSubset<T, UploadSessionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UploadSessionPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a UploadSession.
     * @param {UploadSessionDeleteArgs} args - Arguments to delete one UploadSession.
     * @example
     * // Delete one UploadSession
     * const UploadSession = await prisma.uploadSession.delete({
     *   where: {
     *     // ... filter to delete one UploadSession
     *   }
     * })
     * 
     */
    delete<T extends UploadSessionDeleteArgs>(args: SelectSubset<T, UploadSessionDeleteArgs<ExtArgs>>): Prisma__UploadSessionClient<$Result.GetResult<Prisma.$UploadSessionPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one UploadSession.
     * @param {UploadSessionUpdateArgs} args - Arguments to update one UploadSession.
     * @example
     * // Update one UploadSession
     * const uploadSession = await prisma.uploadSession.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UploadSessionUpdateArgs>(args: SelectSubset<T, UploadSessionUpdateArgs<ExtArgs>>): Prisma__UploadSessionClient<$Result.GetResult<Prisma.$UploadSessionPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more UploadSessions.
     * @param {UploadSessionDeleteManyArgs} args - Arguments to filter UploadSessions to delete.
     * @example
     * // Delete a few UploadSessions
     * const { count } = await prisma.uploadSession.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UploadSessionDeleteManyArgs>(args?: SelectSubset<T, UploadSessionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more UploadSessions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UploadSessionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many UploadSessions
     * const uploadSession = await prisma.uploadSession.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UploadSessionUpdateManyArgs>(args: SelectSubset<T, UploadSessionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one UploadSession.
     * @param {UploadSessionUpsertArgs} args - Arguments to update or create a UploadSession.
     * @example
     * // Update or create a UploadSession
     * const uploadSession = await prisma.uploadSession.upsert({
     *   create: {
     *     // ... data to create a UploadSession
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the UploadSession we want to update
     *   }
     * })
     */
    upsert<T extends UploadSessionUpsertArgs>(args: SelectSubset<T, UploadSessionUpsertArgs<ExtArgs>>): Prisma__UploadSessionClient<$Result.GetResult<Prisma.$UploadSessionPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of UploadSessions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UploadSessionCountArgs} args - Arguments to filter UploadSessions to count.
     * @example
     * // Count the number of UploadSessions
     * const count = await prisma.uploadSession.count({
     *   where: {
     *     // ... the filter for the UploadSessions we want to count
     *   }
     * })
    **/
    count<T extends UploadSessionCountArgs>(
      args?: Subset<T, UploadSessionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UploadSessionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a UploadSession.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UploadSessionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UploadSessionAggregateArgs>(args: Subset<T, UploadSessionAggregateArgs>): Prisma.PrismaPromise<GetUploadSessionAggregateType<T>>

    /**
     * Group by UploadSession.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UploadSessionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UploadSessionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UploadSessionGroupByArgs['orderBy'] }
        : { orderBy?: UploadSessionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UploadSessionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUploadSessionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the UploadSession model
   */
  readonly fields: UploadSessionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for UploadSession.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UploadSessionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the UploadSession model
   */ 
  interface UploadSessionFieldRefs {
    readonly id: FieldRef<"UploadSession", 'String'>
    readonly assetId: FieldRef<"UploadSession", 'String'>
    readonly filename: FieldRef<"UploadSession", 'String'>
    readonly fileSize: FieldRef<"UploadSession", 'Int'>
    readonly mimeType: FieldRef<"UploadSession", 'String'>
    readonly kind: FieldRef<"UploadSession", 'AssetKind'>
    readonly parUrl: FieldRef<"UploadSession", 'String'>
    readonly targetKey: FieldRef<"UploadSession", 'String'>
    readonly expiresAt: FieldRef<"UploadSession", 'DateTime'>
    readonly status: FieldRef<"UploadSession", 'UploadStatus'>
    readonly uploadedAt: FieldRef<"UploadSession", 'DateTime'>
    readonly userId: FieldRef<"UploadSession", 'String'>
    readonly productId: FieldRef<"UploadSession", 'String'>
    readonly variantId: FieldRef<"UploadSession", 'String'>
    readonly role: FieldRef<"UploadSession", 'AssetRole'>
    readonly idempotencyKey: FieldRef<"UploadSession", 'String'>
    readonly createdAt: FieldRef<"UploadSession", 'DateTime'>
    readonly updatedAt: FieldRef<"UploadSession", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * UploadSession findUnique
   */
  export type UploadSessionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UploadSession
     */
    select?: UploadSessionSelect<ExtArgs> | null
    /**
     * Filter, which UploadSession to fetch.
     */
    where: UploadSessionWhereUniqueInput
  }

  /**
   * UploadSession findUniqueOrThrow
   */
  export type UploadSessionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UploadSession
     */
    select?: UploadSessionSelect<ExtArgs> | null
    /**
     * Filter, which UploadSession to fetch.
     */
    where: UploadSessionWhereUniqueInput
  }

  /**
   * UploadSession findFirst
   */
  export type UploadSessionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UploadSession
     */
    select?: UploadSessionSelect<ExtArgs> | null
    /**
     * Filter, which UploadSession to fetch.
     */
    where?: UploadSessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UploadSessions to fetch.
     */
    orderBy?: UploadSessionOrderByWithRelationInput | UploadSessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for UploadSessions.
     */
    cursor?: UploadSessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UploadSessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UploadSessions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of UploadSessions.
     */
    distinct?: UploadSessionScalarFieldEnum | UploadSessionScalarFieldEnum[]
  }

  /**
   * UploadSession findFirstOrThrow
   */
  export type UploadSessionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UploadSession
     */
    select?: UploadSessionSelect<ExtArgs> | null
    /**
     * Filter, which UploadSession to fetch.
     */
    where?: UploadSessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UploadSessions to fetch.
     */
    orderBy?: UploadSessionOrderByWithRelationInput | UploadSessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for UploadSessions.
     */
    cursor?: UploadSessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UploadSessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UploadSessions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of UploadSessions.
     */
    distinct?: UploadSessionScalarFieldEnum | UploadSessionScalarFieldEnum[]
  }

  /**
   * UploadSession findMany
   */
  export type UploadSessionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UploadSession
     */
    select?: UploadSessionSelect<ExtArgs> | null
    /**
     * Filter, which UploadSessions to fetch.
     */
    where?: UploadSessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UploadSessions to fetch.
     */
    orderBy?: UploadSessionOrderByWithRelationInput | UploadSessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing UploadSessions.
     */
    cursor?: UploadSessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UploadSessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UploadSessions.
     */
    skip?: number
    distinct?: UploadSessionScalarFieldEnum | UploadSessionScalarFieldEnum[]
  }

  /**
   * UploadSession create
   */
  export type UploadSessionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UploadSession
     */
    select?: UploadSessionSelect<ExtArgs> | null
    /**
     * The data needed to create a UploadSession.
     */
    data: XOR<UploadSessionCreateInput, UploadSessionUncheckedCreateInput>
  }

  /**
   * UploadSession createMany
   */
  export type UploadSessionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many UploadSessions.
     */
    data: UploadSessionCreateManyInput | UploadSessionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * UploadSession createManyAndReturn
   */
  export type UploadSessionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UploadSession
     */
    select?: UploadSessionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many UploadSessions.
     */
    data: UploadSessionCreateManyInput | UploadSessionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * UploadSession update
   */
  export type UploadSessionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UploadSession
     */
    select?: UploadSessionSelect<ExtArgs> | null
    /**
     * The data needed to update a UploadSession.
     */
    data: XOR<UploadSessionUpdateInput, UploadSessionUncheckedUpdateInput>
    /**
     * Choose, which UploadSession to update.
     */
    where: UploadSessionWhereUniqueInput
  }

  /**
   * UploadSession updateMany
   */
  export type UploadSessionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update UploadSessions.
     */
    data: XOR<UploadSessionUpdateManyMutationInput, UploadSessionUncheckedUpdateManyInput>
    /**
     * Filter which UploadSessions to update
     */
    where?: UploadSessionWhereInput
  }

  /**
   * UploadSession upsert
   */
  export type UploadSessionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UploadSession
     */
    select?: UploadSessionSelect<ExtArgs> | null
    /**
     * The filter to search for the UploadSession to update in case it exists.
     */
    where: UploadSessionWhereUniqueInput
    /**
     * In case the UploadSession found by the `where` argument doesn't exist, create a new UploadSession with this data.
     */
    create: XOR<UploadSessionCreateInput, UploadSessionUncheckedCreateInput>
    /**
     * In case the UploadSession was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UploadSessionUpdateInput, UploadSessionUncheckedUpdateInput>
  }

  /**
   * UploadSession delete
   */
  export type UploadSessionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UploadSession
     */
    select?: UploadSessionSelect<ExtArgs> | null
    /**
     * Filter which UploadSession to delete.
     */
    where: UploadSessionWhereUniqueInput
  }

  /**
   * UploadSession deleteMany
   */
  export type UploadSessionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which UploadSessions to delete
     */
    where?: UploadSessionWhereInput
  }

  /**
   * UploadSession without action
   */
  export type UploadSessionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UploadSession
     */
    select?: UploadSessionSelect<ExtArgs> | null
  }


  /**
   * Model LicenseRecord
   */

  export type AggregateLicenseRecord = {
    _count: LicenseRecordCountAggregateOutputType | null
    _min: LicenseRecordMinAggregateOutputType | null
    _max: LicenseRecordMaxAggregateOutputType | null
  }

  export type LicenseRecordMinAggregateOutputType = {
    id: string | null
    licenseType: string | null
    sourceVendor: string | null
    sourceVendorId: string | null
    attribution: string | null
    territory: string | null
    expiresAt: Date | null
    proofDocKey: string | null
    createdBy: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type LicenseRecordMaxAggregateOutputType = {
    id: string | null
    licenseType: string | null
    sourceVendor: string | null
    sourceVendorId: string | null
    attribution: string | null
    territory: string | null
    expiresAt: Date | null
    proofDocKey: string | null
    createdBy: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type LicenseRecordCountAggregateOutputType = {
    id: number
    assetIds: number
    licenseType: number
    sourceVendor: number
    sourceVendorId: number
    attribution: number
    usageScope: number
    territory: number
    expiresAt: number
    proofDocKey: number
    alertsSent: number
    createdBy: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type LicenseRecordMinAggregateInputType = {
    id?: true
    licenseType?: true
    sourceVendor?: true
    sourceVendorId?: true
    attribution?: true
    territory?: true
    expiresAt?: true
    proofDocKey?: true
    createdBy?: true
    createdAt?: true
    updatedAt?: true
  }

  export type LicenseRecordMaxAggregateInputType = {
    id?: true
    licenseType?: true
    sourceVendor?: true
    sourceVendorId?: true
    attribution?: true
    territory?: true
    expiresAt?: true
    proofDocKey?: true
    createdBy?: true
    createdAt?: true
    updatedAt?: true
  }

  export type LicenseRecordCountAggregateInputType = {
    id?: true
    assetIds?: true
    licenseType?: true
    sourceVendor?: true
    sourceVendorId?: true
    attribution?: true
    usageScope?: true
    territory?: true
    expiresAt?: true
    proofDocKey?: true
    alertsSent?: true
    createdBy?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type LicenseRecordAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which LicenseRecord to aggregate.
     */
    where?: LicenseRecordWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of LicenseRecords to fetch.
     */
    orderBy?: LicenseRecordOrderByWithRelationInput | LicenseRecordOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: LicenseRecordWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` LicenseRecords from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` LicenseRecords.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned LicenseRecords
    **/
    _count?: true | LicenseRecordCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: LicenseRecordMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: LicenseRecordMaxAggregateInputType
  }

  export type GetLicenseRecordAggregateType<T extends LicenseRecordAggregateArgs> = {
        [P in keyof T & keyof AggregateLicenseRecord]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateLicenseRecord[P]>
      : GetScalarType<T[P], AggregateLicenseRecord[P]>
  }




  export type LicenseRecordGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: LicenseRecordWhereInput
    orderBy?: LicenseRecordOrderByWithAggregationInput | LicenseRecordOrderByWithAggregationInput[]
    by: LicenseRecordScalarFieldEnum[] | LicenseRecordScalarFieldEnum
    having?: LicenseRecordScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: LicenseRecordCountAggregateInputType | true
    _min?: LicenseRecordMinAggregateInputType
    _max?: LicenseRecordMaxAggregateInputType
  }

  export type LicenseRecordGroupByOutputType = {
    id: string
    assetIds: string[]
    licenseType: string
    sourceVendor: string | null
    sourceVendorId: string | null
    attribution: string | null
    usageScope: string[]
    territory: string | null
    expiresAt: Date | null
    proofDocKey: string | null
    alertsSent: JsonValue | null
    createdBy: string
    createdAt: Date
    updatedAt: Date
    _count: LicenseRecordCountAggregateOutputType | null
    _min: LicenseRecordMinAggregateOutputType | null
    _max: LicenseRecordMaxAggregateOutputType | null
  }

  type GetLicenseRecordGroupByPayload<T extends LicenseRecordGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<LicenseRecordGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof LicenseRecordGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], LicenseRecordGroupByOutputType[P]>
            : GetScalarType<T[P], LicenseRecordGroupByOutputType[P]>
        }
      >
    >


  export type LicenseRecordSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    assetIds?: boolean
    licenseType?: boolean
    sourceVendor?: boolean
    sourceVendorId?: boolean
    attribution?: boolean
    usageScope?: boolean
    territory?: boolean
    expiresAt?: boolean
    proofDocKey?: boolean
    alertsSent?: boolean
    createdBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["licenseRecord"]>

  export type LicenseRecordSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    assetIds?: boolean
    licenseType?: boolean
    sourceVendor?: boolean
    sourceVendorId?: boolean
    attribution?: boolean
    usageScope?: boolean
    territory?: boolean
    expiresAt?: boolean
    proofDocKey?: boolean
    alertsSent?: boolean
    createdBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["licenseRecord"]>

  export type LicenseRecordSelectScalar = {
    id?: boolean
    assetIds?: boolean
    licenseType?: boolean
    sourceVendor?: boolean
    sourceVendorId?: boolean
    attribution?: boolean
    usageScope?: boolean
    territory?: boolean
    expiresAt?: boolean
    proofDocKey?: boolean
    alertsSent?: boolean
    createdBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }


  export type $LicenseRecordPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "LicenseRecord"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      assetIds: string[]
      licenseType: string
      sourceVendor: string | null
      sourceVendorId: string | null
      attribution: string | null
      usageScope: string[]
      territory: string | null
      expiresAt: Date | null
      proofDocKey: string | null
      alertsSent: Prisma.JsonValue | null
      createdBy: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["licenseRecord"]>
    composites: {}
  }

  type LicenseRecordGetPayload<S extends boolean | null | undefined | LicenseRecordDefaultArgs> = $Result.GetResult<Prisma.$LicenseRecordPayload, S>

  type LicenseRecordCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<LicenseRecordFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: LicenseRecordCountAggregateInputType | true
    }

  export interface LicenseRecordDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['LicenseRecord'], meta: { name: 'LicenseRecord' } }
    /**
     * Find zero or one LicenseRecord that matches the filter.
     * @param {LicenseRecordFindUniqueArgs} args - Arguments to find a LicenseRecord
     * @example
     * // Get one LicenseRecord
     * const licenseRecord = await prisma.licenseRecord.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends LicenseRecordFindUniqueArgs>(args: SelectSubset<T, LicenseRecordFindUniqueArgs<ExtArgs>>): Prisma__LicenseRecordClient<$Result.GetResult<Prisma.$LicenseRecordPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one LicenseRecord that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {LicenseRecordFindUniqueOrThrowArgs} args - Arguments to find a LicenseRecord
     * @example
     * // Get one LicenseRecord
     * const licenseRecord = await prisma.licenseRecord.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends LicenseRecordFindUniqueOrThrowArgs>(args: SelectSubset<T, LicenseRecordFindUniqueOrThrowArgs<ExtArgs>>): Prisma__LicenseRecordClient<$Result.GetResult<Prisma.$LicenseRecordPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first LicenseRecord that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LicenseRecordFindFirstArgs} args - Arguments to find a LicenseRecord
     * @example
     * // Get one LicenseRecord
     * const licenseRecord = await prisma.licenseRecord.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends LicenseRecordFindFirstArgs>(args?: SelectSubset<T, LicenseRecordFindFirstArgs<ExtArgs>>): Prisma__LicenseRecordClient<$Result.GetResult<Prisma.$LicenseRecordPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first LicenseRecord that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LicenseRecordFindFirstOrThrowArgs} args - Arguments to find a LicenseRecord
     * @example
     * // Get one LicenseRecord
     * const licenseRecord = await prisma.licenseRecord.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends LicenseRecordFindFirstOrThrowArgs>(args?: SelectSubset<T, LicenseRecordFindFirstOrThrowArgs<ExtArgs>>): Prisma__LicenseRecordClient<$Result.GetResult<Prisma.$LicenseRecordPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more LicenseRecords that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LicenseRecordFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all LicenseRecords
     * const licenseRecords = await prisma.licenseRecord.findMany()
     * 
     * // Get first 10 LicenseRecords
     * const licenseRecords = await prisma.licenseRecord.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const licenseRecordWithIdOnly = await prisma.licenseRecord.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends LicenseRecordFindManyArgs>(args?: SelectSubset<T, LicenseRecordFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LicenseRecordPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a LicenseRecord.
     * @param {LicenseRecordCreateArgs} args - Arguments to create a LicenseRecord.
     * @example
     * // Create one LicenseRecord
     * const LicenseRecord = await prisma.licenseRecord.create({
     *   data: {
     *     // ... data to create a LicenseRecord
     *   }
     * })
     * 
     */
    create<T extends LicenseRecordCreateArgs>(args: SelectSubset<T, LicenseRecordCreateArgs<ExtArgs>>): Prisma__LicenseRecordClient<$Result.GetResult<Prisma.$LicenseRecordPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many LicenseRecords.
     * @param {LicenseRecordCreateManyArgs} args - Arguments to create many LicenseRecords.
     * @example
     * // Create many LicenseRecords
     * const licenseRecord = await prisma.licenseRecord.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends LicenseRecordCreateManyArgs>(args?: SelectSubset<T, LicenseRecordCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many LicenseRecords and returns the data saved in the database.
     * @param {LicenseRecordCreateManyAndReturnArgs} args - Arguments to create many LicenseRecords.
     * @example
     * // Create many LicenseRecords
     * const licenseRecord = await prisma.licenseRecord.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many LicenseRecords and only return the `id`
     * const licenseRecordWithIdOnly = await prisma.licenseRecord.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends LicenseRecordCreateManyAndReturnArgs>(args?: SelectSubset<T, LicenseRecordCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LicenseRecordPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a LicenseRecord.
     * @param {LicenseRecordDeleteArgs} args - Arguments to delete one LicenseRecord.
     * @example
     * // Delete one LicenseRecord
     * const LicenseRecord = await prisma.licenseRecord.delete({
     *   where: {
     *     // ... filter to delete one LicenseRecord
     *   }
     * })
     * 
     */
    delete<T extends LicenseRecordDeleteArgs>(args: SelectSubset<T, LicenseRecordDeleteArgs<ExtArgs>>): Prisma__LicenseRecordClient<$Result.GetResult<Prisma.$LicenseRecordPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one LicenseRecord.
     * @param {LicenseRecordUpdateArgs} args - Arguments to update one LicenseRecord.
     * @example
     * // Update one LicenseRecord
     * const licenseRecord = await prisma.licenseRecord.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends LicenseRecordUpdateArgs>(args: SelectSubset<T, LicenseRecordUpdateArgs<ExtArgs>>): Prisma__LicenseRecordClient<$Result.GetResult<Prisma.$LicenseRecordPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more LicenseRecords.
     * @param {LicenseRecordDeleteManyArgs} args - Arguments to filter LicenseRecords to delete.
     * @example
     * // Delete a few LicenseRecords
     * const { count } = await prisma.licenseRecord.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends LicenseRecordDeleteManyArgs>(args?: SelectSubset<T, LicenseRecordDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more LicenseRecords.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LicenseRecordUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many LicenseRecords
     * const licenseRecord = await prisma.licenseRecord.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends LicenseRecordUpdateManyArgs>(args: SelectSubset<T, LicenseRecordUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one LicenseRecord.
     * @param {LicenseRecordUpsertArgs} args - Arguments to update or create a LicenseRecord.
     * @example
     * // Update or create a LicenseRecord
     * const licenseRecord = await prisma.licenseRecord.upsert({
     *   create: {
     *     // ... data to create a LicenseRecord
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the LicenseRecord we want to update
     *   }
     * })
     */
    upsert<T extends LicenseRecordUpsertArgs>(args: SelectSubset<T, LicenseRecordUpsertArgs<ExtArgs>>): Prisma__LicenseRecordClient<$Result.GetResult<Prisma.$LicenseRecordPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of LicenseRecords.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LicenseRecordCountArgs} args - Arguments to filter LicenseRecords to count.
     * @example
     * // Count the number of LicenseRecords
     * const count = await prisma.licenseRecord.count({
     *   where: {
     *     // ... the filter for the LicenseRecords we want to count
     *   }
     * })
    **/
    count<T extends LicenseRecordCountArgs>(
      args?: Subset<T, LicenseRecordCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], LicenseRecordCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a LicenseRecord.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LicenseRecordAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends LicenseRecordAggregateArgs>(args: Subset<T, LicenseRecordAggregateArgs>): Prisma.PrismaPromise<GetLicenseRecordAggregateType<T>>

    /**
     * Group by LicenseRecord.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LicenseRecordGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends LicenseRecordGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: LicenseRecordGroupByArgs['orderBy'] }
        : { orderBy?: LicenseRecordGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, LicenseRecordGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetLicenseRecordGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the LicenseRecord model
   */
  readonly fields: LicenseRecordFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for LicenseRecord.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__LicenseRecordClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the LicenseRecord model
   */ 
  interface LicenseRecordFieldRefs {
    readonly id: FieldRef<"LicenseRecord", 'String'>
    readonly assetIds: FieldRef<"LicenseRecord", 'String[]'>
    readonly licenseType: FieldRef<"LicenseRecord", 'String'>
    readonly sourceVendor: FieldRef<"LicenseRecord", 'String'>
    readonly sourceVendorId: FieldRef<"LicenseRecord", 'String'>
    readonly attribution: FieldRef<"LicenseRecord", 'String'>
    readonly usageScope: FieldRef<"LicenseRecord", 'String[]'>
    readonly territory: FieldRef<"LicenseRecord", 'String'>
    readonly expiresAt: FieldRef<"LicenseRecord", 'DateTime'>
    readonly proofDocKey: FieldRef<"LicenseRecord", 'String'>
    readonly alertsSent: FieldRef<"LicenseRecord", 'Json'>
    readonly createdBy: FieldRef<"LicenseRecord", 'String'>
    readonly createdAt: FieldRef<"LicenseRecord", 'DateTime'>
    readonly updatedAt: FieldRef<"LicenseRecord", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * LicenseRecord findUnique
   */
  export type LicenseRecordFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LicenseRecord
     */
    select?: LicenseRecordSelect<ExtArgs> | null
    /**
     * Filter, which LicenseRecord to fetch.
     */
    where: LicenseRecordWhereUniqueInput
  }

  /**
   * LicenseRecord findUniqueOrThrow
   */
  export type LicenseRecordFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LicenseRecord
     */
    select?: LicenseRecordSelect<ExtArgs> | null
    /**
     * Filter, which LicenseRecord to fetch.
     */
    where: LicenseRecordWhereUniqueInput
  }

  /**
   * LicenseRecord findFirst
   */
  export type LicenseRecordFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LicenseRecord
     */
    select?: LicenseRecordSelect<ExtArgs> | null
    /**
     * Filter, which LicenseRecord to fetch.
     */
    where?: LicenseRecordWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of LicenseRecords to fetch.
     */
    orderBy?: LicenseRecordOrderByWithRelationInput | LicenseRecordOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for LicenseRecords.
     */
    cursor?: LicenseRecordWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` LicenseRecords from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` LicenseRecords.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of LicenseRecords.
     */
    distinct?: LicenseRecordScalarFieldEnum | LicenseRecordScalarFieldEnum[]
  }

  /**
   * LicenseRecord findFirstOrThrow
   */
  export type LicenseRecordFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LicenseRecord
     */
    select?: LicenseRecordSelect<ExtArgs> | null
    /**
     * Filter, which LicenseRecord to fetch.
     */
    where?: LicenseRecordWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of LicenseRecords to fetch.
     */
    orderBy?: LicenseRecordOrderByWithRelationInput | LicenseRecordOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for LicenseRecords.
     */
    cursor?: LicenseRecordWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` LicenseRecords from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` LicenseRecords.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of LicenseRecords.
     */
    distinct?: LicenseRecordScalarFieldEnum | LicenseRecordScalarFieldEnum[]
  }

  /**
   * LicenseRecord findMany
   */
  export type LicenseRecordFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LicenseRecord
     */
    select?: LicenseRecordSelect<ExtArgs> | null
    /**
     * Filter, which LicenseRecords to fetch.
     */
    where?: LicenseRecordWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of LicenseRecords to fetch.
     */
    orderBy?: LicenseRecordOrderByWithRelationInput | LicenseRecordOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing LicenseRecords.
     */
    cursor?: LicenseRecordWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` LicenseRecords from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` LicenseRecords.
     */
    skip?: number
    distinct?: LicenseRecordScalarFieldEnum | LicenseRecordScalarFieldEnum[]
  }

  /**
   * LicenseRecord create
   */
  export type LicenseRecordCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LicenseRecord
     */
    select?: LicenseRecordSelect<ExtArgs> | null
    /**
     * The data needed to create a LicenseRecord.
     */
    data: XOR<LicenseRecordCreateInput, LicenseRecordUncheckedCreateInput>
  }

  /**
   * LicenseRecord createMany
   */
  export type LicenseRecordCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many LicenseRecords.
     */
    data: LicenseRecordCreateManyInput | LicenseRecordCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * LicenseRecord createManyAndReturn
   */
  export type LicenseRecordCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LicenseRecord
     */
    select?: LicenseRecordSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many LicenseRecords.
     */
    data: LicenseRecordCreateManyInput | LicenseRecordCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * LicenseRecord update
   */
  export type LicenseRecordUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LicenseRecord
     */
    select?: LicenseRecordSelect<ExtArgs> | null
    /**
     * The data needed to update a LicenseRecord.
     */
    data: XOR<LicenseRecordUpdateInput, LicenseRecordUncheckedUpdateInput>
    /**
     * Choose, which LicenseRecord to update.
     */
    where: LicenseRecordWhereUniqueInput
  }

  /**
   * LicenseRecord updateMany
   */
  export type LicenseRecordUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update LicenseRecords.
     */
    data: XOR<LicenseRecordUpdateManyMutationInput, LicenseRecordUncheckedUpdateManyInput>
    /**
     * Filter which LicenseRecords to update
     */
    where?: LicenseRecordWhereInput
  }

  /**
   * LicenseRecord upsert
   */
  export type LicenseRecordUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LicenseRecord
     */
    select?: LicenseRecordSelect<ExtArgs> | null
    /**
     * The filter to search for the LicenseRecord to update in case it exists.
     */
    where: LicenseRecordWhereUniqueInput
    /**
     * In case the LicenseRecord found by the `where` argument doesn't exist, create a new LicenseRecord with this data.
     */
    create: XOR<LicenseRecordCreateInput, LicenseRecordUncheckedCreateInput>
    /**
     * In case the LicenseRecord was found with the provided `where` argument, update it with this data.
     */
    update: XOR<LicenseRecordUpdateInput, LicenseRecordUncheckedUpdateInput>
  }

  /**
   * LicenseRecord delete
   */
  export type LicenseRecordDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LicenseRecord
     */
    select?: LicenseRecordSelect<ExtArgs> | null
    /**
     * Filter which LicenseRecord to delete.
     */
    where: LicenseRecordWhereUniqueInput
  }

  /**
   * LicenseRecord deleteMany
   */
  export type LicenseRecordDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which LicenseRecords to delete
     */
    where?: LicenseRecordWhereInput
  }

  /**
   * LicenseRecord without action
   */
  export type LicenseRecordDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LicenseRecord
     */
    select?: LicenseRecordSelect<ExtArgs> | null
  }


  /**
   * Model OutboxEvent
   */

  export type AggregateOutboxEvent = {
    _count: OutboxEventCountAggregateOutputType | null
    _avg: OutboxEventAvgAggregateOutputType | null
    _sum: OutboxEventSumAggregateOutputType | null
    _min: OutboxEventMinAggregateOutputType | null
    _max: OutboxEventMaxAggregateOutputType | null
  }

  export type OutboxEventAvgAggregateOutputType = {
    retryCount: number | null
  }

  export type OutboxEventSumAggregateOutputType = {
    retryCount: number | null
  }

  export type OutboxEventMinAggregateOutputType = {
    id: string | null
    type: string | null
    published: boolean | null
    createdAt: Date | null
    publishedAt: Date | null
    retryCount: number | null
    lastError: string | null
  }

  export type OutboxEventMaxAggregateOutputType = {
    id: string | null
    type: string | null
    published: boolean | null
    createdAt: Date | null
    publishedAt: Date | null
    retryCount: number | null
    lastError: string | null
  }

  export type OutboxEventCountAggregateOutputType = {
    id: number
    type: number
    payload: number
    headers: number
    published: number
    createdAt: number
    publishedAt: number
    retryCount: number
    lastError: number
    _all: number
  }


  export type OutboxEventAvgAggregateInputType = {
    retryCount?: true
  }

  export type OutboxEventSumAggregateInputType = {
    retryCount?: true
  }

  export type OutboxEventMinAggregateInputType = {
    id?: true
    type?: true
    published?: true
    createdAt?: true
    publishedAt?: true
    retryCount?: true
    lastError?: true
  }

  export type OutboxEventMaxAggregateInputType = {
    id?: true
    type?: true
    published?: true
    createdAt?: true
    publishedAt?: true
    retryCount?: true
    lastError?: true
  }

  export type OutboxEventCountAggregateInputType = {
    id?: true
    type?: true
    payload?: true
    headers?: true
    published?: true
    createdAt?: true
    publishedAt?: true
    retryCount?: true
    lastError?: true
    _all?: true
  }

  export type OutboxEventAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which OutboxEvent to aggregate.
     */
    where?: OutboxEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OutboxEvents to fetch.
     */
    orderBy?: OutboxEventOrderByWithRelationInput | OutboxEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: OutboxEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OutboxEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OutboxEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned OutboxEvents
    **/
    _count?: true | OutboxEventCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: OutboxEventAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: OutboxEventSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: OutboxEventMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: OutboxEventMaxAggregateInputType
  }

  export type GetOutboxEventAggregateType<T extends OutboxEventAggregateArgs> = {
        [P in keyof T & keyof AggregateOutboxEvent]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateOutboxEvent[P]>
      : GetScalarType<T[P], AggregateOutboxEvent[P]>
  }




  export type OutboxEventGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: OutboxEventWhereInput
    orderBy?: OutboxEventOrderByWithAggregationInput | OutboxEventOrderByWithAggregationInput[]
    by: OutboxEventScalarFieldEnum[] | OutboxEventScalarFieldEnum
    having?: OutboxEventScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: OutboxEventCountAggregateInputType | true
    _avg?: OutboxEventAvgAggregateInputType
    _sum?: OutboxEventSumAggregateInputType
    _min?: OutboxEventMinAggregateInputType
    _max?: OutboxEventMaxAggregateInputType
  }

  export type OutboxEventGroupByOutputType = {
    id: string
    type: string
    payload: JsonValue
    headers: JsonValue | null
    published: boolean
    createdAt: Date
    publishedAt: Date | null
    retryCount: number
    lastError: string | null
    _count: OutboxEventCountAggregateOutputType | null
    _avg: OutboxEventAvgAggregateOutputType | null
    _sum: OutboxEventSumAggregateOutputType | null
    _min: OutboxEventMinAggregateOutputType | null
    _max: OutboxEventMaxAggregateOutputType | null
  }

  type GetOutboxEventGroupByPayload<T extends OutboxEventGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<OutboxEventGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof OutboxEventGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], OutboxEventGroupByOutputType[P]>
            : GetScalarType<T[P], OutboxEventGroupByOutputType[P]>
        }
      >
    >


  export type OutboxEventSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    payload?: boolean
    headers?: boolean
    published?: boolean
    createdAt?: boolean
    publishedAt?: boolean
    retryCount?: boolean
    lastError?: boolean
  }, ExtArgs["result"]["outboxEvent"]>

  export type OutboxEventSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    payload?: boolean
    headers?: boolean
    published?: boolean
    createdAt?: boolean
    publishedAt?: boolean
    retryCount?: boolean
    lastError?: boolean
  }, ExtArgs["result"]["outboxEvent"]>

  export type OutboxEventSelectScalar = {
    id?: boolean
    type?: boolean
    payload?: boolean
    headers?: boolean
    published?: boolean
    createdAt?: boolean
    publishedAt?: boolean
    retryCount?: boolean
    lastError?: boolean
  }


  export type $OutboxEventPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "OutboxEvent"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      type: string
      payload: Prisma.JsonValue
      headers: Prisma.JsonValue | null
      published: boolean
      createdAt: Date
      publishedAt: Date | null
      retryCount: number
      lastError: string | null
    }, ExtArgs["result"]["outboxEvent"]>
    composites: {}
  }

  type OutboxEventGetPayload<S extends boolean | null | undefined | OutboxEventDefaultArgs> = $Result.GetResult<Prisma.$OutboxEventPayload, S>

  type OutboxEventCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<OutboxEventFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: OutboxEventCountAggregateInputType | true
    }

  export interface OutboxEventDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['OutboxEvent'], meta: { name: 'OutboxEvent' } }
    /**
     * Find zero or one OutboxEvent that matches the filter.
     * @param {OutboxEventFindUniqueArgs} args - Arguments to find a OutboxEvent
     * @example
     * // Get one OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends OutboxEventFindUniqueArgs>(args: SelectSubset<T, OutboxEventFindUniqueArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one OutboxEvent that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {OutboxEventFindUniqueOrThrowArgs} args - Arguments to find a OutboxEvent
     * @example
     * // Get one OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends OutboxEventFindUniqueOrThrowArgs>(args: SelectSubset<T, OutboxEventFindUniqueOrThrowArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first OutboxEvent that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventFindFirstArgs} args - Arguments to find a OutboxEvent
     * @example
     * // Get one OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends OutboxEventFindFirstArgs>(args?: SelectSubset<T, OutboxEventFindFirstArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first OutboxEvent that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventFindFirstOrThrowArgs} args - Arguments to find a OutboxEvent
     * @example
     * // Get one OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends OutboxEventFindFirstOrThrowArgs>(args?: SelectSubset<T, OutboxEventFindFirstOrThrowArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more OutboxEvents that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all OutboxEvents
     * const outboxEvents = await prisma.outboxEvent.findMany()
     * 
     * // Get first 10 OutboxEvents
     * const outboxEvents = await prisma.outboxEvent.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const outboxEventWithIdOnly = await prisma.outboxEvent.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends OutboxEventFindManyArgs>(args?: SelectSubset<T, OutboxEventFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a OutboxEvent.
     * @param {OutboxEventCreateArgs} args - Arguments to create a OutboxEvent.
     * @example
     * // Create one OutboxEvent
     * const OutboxEvent = await prisma.outboxEvent.create({
     *   data: {
     *     // ... data to create a OutboxEvent
     *   }
     * })
     * 
     */
    create<T extends OutboxEventCreateArgs>(args: SelectSubset<T, OutboxEventCreateArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many OutboxEvents.
     * @param {OutboxEventCreateManyArgs} args - Arguments to create many OutboxEvents.
     * @example
     * // Create many OutboxEvents
     * const outboxEvent = await prisma.outboxEvent.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends OutboxEventCreateManyArgs>(args?: SelectSubset<T, OutboxEventCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many OutboxEvents and returns the data saved in the database.
     * @param {OutboxEventCreateManyAndReturnArgs} args - Arguments to create many OutboxEvents.
     * @example
     * // Create many OutboxEvents
     * const outboxEvent = await prisma.outboxEvent.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many OutboxEvents and only return the `id`
     * const outboxEventWithIdOnly = await prisma.outboxEvent.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends OutboxEventCreateManyAndReturnArgs>(args?: SelectSubset<T, OutboxEventCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a OutboxEvent.
     * @param {OutboxEventDeleteArgs} args - Arguments to delete one OutboxEvent.
     * @example
     * // Delete one OutboxEvent
     * const OutboxEvent = await prisma.outboxEvent.delete({
     *   where: {
     *     // ... filter to delete one OutboxEvent
     *   }
     * })
     * 
     */
    delete<T extends OutboxEventDeleteArgs>(args: SelectSubset<T, OutboxEventDeleteArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one OutboxEvent.
     * @param {OutboxEventUpdateArgs} args - Arguments to update one OutboxEvent.
     * @example
     * // Update one OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends OutboxEventUpdateArgs>(args: SelectSubset<T, OutboxEventUpdateArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more OutboxEvents.
     * @param {OutboxEventDeleteManyArgs} args - Arguments to filter OutboxEvents to delete.
     * @example
     * // Delete a few OutboxEvents
     * const { count } = await prisma.outboxEvent.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends OutboxEventDeleteManyArgs>(args?: SelectSubset<T, OutboxEventDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more OutboxEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many OutboxEvents
     * const outboxEvent = await prisma.outboxEvent.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends OutboxEventUpdateManyArgs>(args: SelectSubset<T, OutboxEventUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one OutboxEvent.
     * @param {OutboxEventUpsertArgs} args - Arguments to update or create a OutboxEvent.
     * @example
     * // Update or create a OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.upsert({
     *   create: {
     *     // ... data to create a OutboxEvent
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the OutboxEvent we want to update
     *   }
     * })
     */
    upsert<T extends OutboxEventUpsertArgs>(args: SelectSubset<T, OutboxEventUpsertArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of OutboxEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventCountArgs} args - Arguments to filter OutboxEvents to count.
     * @example
     * // Count the number of OutboxEvents
     * const count = await prisma.outboxEvent.count({
     *   where: {
     *     // ... the filter for the OutboxEvents we want to count
     *   }
     * })
    **/
    count<T extends OutboxEventCountArgs>(
      args?: Subset<T, OutboxEventCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], OutboxEventCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a OutboxEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends OutboxEventAggregateArgs>(args: Subset<T, OutboxEventAggregateArgs>): Prisma.PrismaPromise<GetOutboxEventAggregateType<T>>

    /**
     * Group by OutboxEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends OutboxEventGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: OutboxEventGroupByArgs['orderBy'] }
        : { orderBy?: OutboxEventGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, OutboxEventGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetOutboxEventGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the OutboxEvent model
   */
  readonly fields: OutboxEventFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for OutboxEvent.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__OutboxEventClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the OutboxEvent model
   */ 
  interface OutboxEventFieldRefs {
    readonly id: FieldRef<"OutboxEvent", 'String'>
    readonly type: FieldRef<"OutboxEvent", 'String'>
    readonly payload: FieldRef<"OutboxEvent", 'Json'>
    readonly headers: FieldRef<"OutboxEvent", 'Json'>
    readonly published: FieldRef<"OutboxEvent", 'Boolean'>
    readonly createdAt: FieldRef<"OutboxEvent", 'DateTime'>
    readonly publishedAt: FieldRef<"OutboxEvent", 'DateTime'>
    readonly retryCount: FieldRef<"OutboxEvent", 'Int'>
    readonly lastError: FieldRef<"OutboxEvent", 'String'>
  }
    

  // Custom InputTypes
  /**
   * OutboxEvent findUnique
   */
  export type OutboxEventFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Filter, which OutboxEvent to fetch.
     */
    where: OutboxEventWhereUniqueInput
  }

  /**
   * OutboxEvent findUniqueOrThrow
   */
  export type OutboxEventFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Filter, which OutboxEvent to fetch.
     */
    where: OutboxEventWhereUniqueInput
  }

  /**
   * OutboxEvent findFirst
   */
  export type OutboxEventFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Filter, which OutboxEvent to fetch.
     */
    where?: OutboxEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OutboxEvents to fetch.
     */
    orderBy?: OutboxEventOrderByWithRelationInput | OutboxEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for OutboxEvents.
     */
    cursor?: OutboxEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OutboxEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OutboxEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of OutboxEvents.
     */
    distinct?: OutboxEventScalarFieldEnum | OutboxEventScalarFieldEnum[]
  }

  /**
   * OutboxEvent findFirstOrThrow
   */
  export type OutboxEventFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Filter, which OutboxEvent to fetch.
     */
    where?: OutboxEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OutboxEvents to fetch.
     */
    orderBy?: OutboxEventOrderByWithRelationInput | OutboxEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for OutboxEvents.
     */
    cursor?: OutboxEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OutboxEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OutboxEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of OutboxEvents.
     */
    distinct?: OutboxEventScalarFieldEnum | OutboxEventScalarFieldEnum[]
  }

  /**
   * OutboxEvent findMany
   */
  export type OutboxEventFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Filter, which OutboxEvents to fetch.
     */
    where?: OutboxEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OutboxEvents to fetch.
     */
    orderBy?: OutboxEventOrderByWithRelationInput | OutboxEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing OutboxEvents.
     */
    cursor?: OutboxEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OutboxEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OutboxEvents.
     */
    skip?: number
    distinct?: OutboxEventScalarFieldEnum | OutboxEventScalarFieldEnum[]
  }

  /**
   * OutboxEvent create
   */
  export type OutboxEventCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * The data needed to create a OutboxEvent.
     */
    data: XOR<OutboxEventCreateInput, OutboxEventUncheckedCreateInput>
  }

  /**
   * OutboxEvent createMany
   */
  export type OutboxEventCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many OutboxEvents.
     */
    data: OutboxEventCreateManyInput | OutboxEventCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * OutboxEvent createManyAndReturn
   */
  export type OutboxEventCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many OutboxEvents.
     */
    data: OutboxEventCreateManyInput | OutboxEventCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * OutboxEvent update
   */
  export type OutboxEventUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * The data needed to update a OutboxEvent.
     */
    data: XOR<OutboxEventUpdateInput, OutboxEventUncheckedUpdateInput>
    /**
     * Choose, which OutboxEvent to update.
     */
    where: OutboxEventWhereUniqueInput
  }

  /**
   * OutboxEvent updateMany
   */
  export type OutboxEventUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update OutboxEvents.
     */
    data: XOR<OutboxEventUpdateManyMutationInput, OutboxEventUncheckedUpdateManyInput>
    /**
     * Filter which OutboxEvents to update
     */
    where?: OutboxEventWhereInput
  }

  /**
   * OutboxEvent upsert
   */
  export type OutboxEventUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * The filter to search for the OutboxEvent to update in case it exists.
     */
    where: OutboxEventWhereUniqueInput
    /**
     * In case the OutboxEvent found by the `where` argument doesn't exist, create a new OutboxEvent with this data.
     */
    create: XOR<OutboxEventCreateInput, OutboxEventUncheckedCreateInput>
    /**
     * In case the OutboxEvent was found with the provided `where` argument, update it with this data.
     */
    update: XOR<OutboxEventUpdateInput, OutboxEventUncheckedUpdateInput>
  }

  /**
   * OutboxEvent delete
   */
  export type OutboxEventDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Filter which OutboxEvent to delete.
     */
    where: OutboxEventWhereUniqueInput
  }

  /**
   * OutboxEvent deleteMany
   */
  export type OutboxEventDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which OutboxEvents to delete
     */
    where?: OutboxEventWhereInput
  }

  /**
   * OutboxEvent without action
   */
  export type OutboxEventDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const MediaAssetScalarFieldEnum: {
    id: 'id',
    kind: 'kind',
    productId: 'productId',
    variantId: 'variantId',
    role: 'role',
    rawKey: 'rawKey',
    processed: 'processed',
    status: 'status',
    width: 'width',
    height: 'height',
    format: 'format',
    sizeBytes: 'sizeBytes',
    mimeType: 'mimeType',
    phash: 'phash',
    palette: 'palette',
    blurhash: 'blurhash',
    lqipKey: 'lqipKey',
    license: 'license',
    qcIssues: 'qcIssues',
    qcScore: 'qcScore',
    scanStatus: 'scanStatus',
    scanResult: 'scanResult',
    isPublic: 'isPublic',
    permissions: 'permissions',
    viewCount: 'viewCount',
    downloadCount: 'downloadCount',
    tags: 'tags',
    sortOrder: 'sortOrder',
    uploadedBy: 'uploadedBy',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type MediaAssetScalarFieldEnum = (typeof MediaAssetScalarFieldEnum)[keyof typeof MediaAssetScalarFieldEnum]


  export const AssetRenditionScalarFieldEnum: {
    id: 'id',
    assetId: 'assetId',
    key: 'key',
    width: 'width',
    height: 'height',
    format: 'format',
    sizeBytes: 'sizeBytes',
    purpose: 'purpose',
    transform: 'transform',
    createdAt: 'createdAt'
  };

  export type AssetRenditionScalarFieldEnum = (typeof AssetRenditionScalarFieldEnum)[keyof typeof AssetRenditionScalarFieldEnum]


  export const ThreeDAssetScalarFieldEnum: {
    id: 'id',
    assetId: 'assetId',
    glbKey: 'glbKey',
    usdzKey: 'usdzKey',
    triCount: 'triCount',
    nodeCount: 'nodeCount',
    materialCount: 'materialCount',
    textureCount: 'textureCount',
    widthM: 'widthM',
    heightM: 'heightM',
    depthM: 'depthM',
    volumeM3: 'volumeM3',
    lods: 'lods',
    materials: 'materials',
    textures: 'textures',
    arReady: 'arReady',
    arChecks: 'arChecks',
    snapshots: 'snapshots',
    qcIssues: 'qcIssues',
    drawCalls: 'drawCalls',
    perfBudget: 'perfBudget',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type ThreeDAssetScalarFieldEnum = (typeof ThreeDAssetScalarFieldEnum)[keyof typeof ThreeDAssetScalarFieldEnum]


  export const ProcessJobScalarFieldEnum: {
    id: 'id',
    assetId: 'assetId',
    type: 'type',
    state: 'state',
    priority: 'priority',
    attempts: 'attempts',
    maxRetries: 'maxRetries',
    error: 'error',
    errorCode: 'errorCode',
    queuedAt: 'queuedAt',
    startedAt: 'startedAt',
    finishedAt: 'finishedAt',
    meta: 'meta',
    result: 'result',
    workerId: 'workerId'
  };

  export type ProcessJobScalarFieldEnum = (typeof ProcessJobScalarFieldEnum)[keyof typeof ProcessJobScalarFieldEnum]


  export const UploadSessionScalarFieldEnum: {
    id: 'id',
    assetId: 'assetId',
    filename: 'filename',
    fileSize: 'fileSize',
    mimeType: 'mimeType',
    kind: 'kind',
    parUrl: 'parUrl',
    targetKey: 'targetKey',
    expiresAt: 'expiresAt',
    status: 'status',
    uploadedAt: 'uploadedAt',
    userId: 'userId',
    productId: 'productId',
    variantId: 'variantId',
    role: 'role',
    idempotencyKey: 'idempotencyKey',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type UploadSessionScalarFieldEnum = (typeof UploadSessionScalarFieldEnum)[keyof typeof UploadSessionScalarFieldEnum]


  export const LicenseRecordScalarFieldEnum: {
    id: 'id',
    assetIds: 'assetIds',
    licenseType: 'licenseType',
    sourceVendor: 'sourceVendor',
    sourceVendorId: 'sourceVendorId',
    attribution: 'attribution',
    usageScope: 'usageScope',
    territory: 'territory',
    expiresAt: 'expiresAt',
    proofDocKey: 'proofDocKey',
    alertsSent: 'alertsSent',
    createdBy: 'createdBy',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type LicenseRecordScalarFieldEnum = (typeof LicenseRecordScalarFieldEnum)[keyof typeof LicenseRecordScalarFieldEnum]


  export const OutboxEventScalarFieldEnum: {
    id: 'id',
    type: 'type',
    payload: 'payload',
    headers: 'headers',
    published: 'published',
    createdAt: 'createdAt',
    publishedAt: 'publishedAt',
    retryCount: 'retryCount',
    lastError: 'lastError'
  };

  export type OutboxEventScalarFieldEnum = (typeof OutboxEventScalarFieldEnum)[keyof typeof OutboxEventScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'AssetKind'
   */
  export type EnumAssetKindFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AssetKind'>
    


  /**
   * Reference to a field of type 'AssetKind[]'
   */
  export type ListEnumAssetKindFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AssetKind[]'>
    


  /**
   * Reference to a field of type 'AssetRole'
   */
  export type EnumAssetRoleFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AssetRole'>
    


  /**
   * Reference to a field of type 'AssetRole[]'
   */
  export type ListEnumAssetRoleFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AssetRole[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'AssetStatus'
   */
  export type EnumAssetStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AssetStatus'>
    


  /**
   * Reference to a field of type 'AssetStatus[]'
   */
  export type ListEnumAssetStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'AssetStatus[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    


  /**
   * Reference to a field of type 'ScanStatus'
   */
  export type EnumScanStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ScanStatus'>
    


  /**
   * Reference to a field of type 'ScanStatus[]'
   */
  export type ListEnumScanStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ScanStatus[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'RenditionFormat'
   */
  export type EnumRenditionFormatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'RenditionFormat'>
    


  /**
   * Reference to a field of type 'RenditionFormat[]'
   */
  export type ListEnumRenditionFormatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'RenditionFormat[]'>
    


  /**
   * Reference to a field of type 'RenditionPurpose'
   */
  export type EnumRenditionPurposeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'RenditionPurpose'>
    


  /**
   * Reference to a field of type 'RenditionPurpose[]'
   */
  export type ListEnumRenditionPurposeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'RenditionPurpose[]'>
    


  /**
   * Reference to a field of type 'JobType'
   */
  export type EnumJobTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'JobType'>
    


  /**
   * Reference to a field of type 'JobType[]'
   */
  export type ListEnumJobTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'JobType[]'>
    


  /**
   * Reference to a field of type 'JobState'
   */
  export type EnumJobStateFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'JobState'>
    


  /**
   * Reference to a field of type 'JobState[]'
   */
  export type ListEnumJobStateFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'JobState[]'>
    


  /**
   * Reference to a field of type 'UploadStatus'
   */
  export type EnumUploadStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'UploadStatus'>
    


  /**
   * Reference to a field of type 'UploadStatus[]'
   */
  export type ListEnumUploadStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'UploadStatus[]'>
    
  /**
   * Deep Input Types
   */


  export type MediaAssetWhereInput = {
    AND?: MediaAssetWhereInput | MediaAssetWhereInput[]
    OR?: MediaAssetWhereInput[]
    NOT?: MediaAssetWhereInput | MediaAssetWhereInput[]
    id?: StringFilter<"MediaAsset"> | string
    kind?: EnumAssetKindFilter<"MediaAsset"> | $Enums.AssetKind
    productId?: StringNullableFilter<"MediaAsset"> | string | null
    variantId?: StringNullableFilter<"MediaAsset"> | string | null
    role?: EnumAssetRoleNullableFilter<"MediaAsset"> | $Enums.AssetRole | null
    rawKey?: StringFilter<"MediaAsset"> | string
    processed?: BoolFilter<"MediaAsset"> | boolean
    status?: EnumAssetStatusFilter<"MediaAsset"> | $Enums.AssetStatus
    width?: IntNullableFilter<"MediaAsset"> | number | null
    height?: IntNullableFilter<"MediaAsset"> | number | null
    format?: StringNullableFilter<"MediaAsset"> | string | null
    sizeBytes?: IntNullableFilter<"MediaAsset"> | number | null
    mimeType?: StringNullableFilter<"MediaAsset"> | string | null
    phash?: StringNullableFilter<"MediaAsset"> | string | null
    palette?: JsonNullableFilter<"MediaAsset">
    blurhash?: StringNullableFilter<"MediaAsset"> | string | null
    lqipKey?: StringNullableFilter<"MediaAsset"> | string | null
    license?: JsonNullableFilter<"MediaAsset">
    qcIssues?: JsonNullableFilter<"MediaAsset">
    qcScore?: FloatNullableFilter<"MediaAsset"> | number | null
    scanStatus?: EnumScanStatusFilter<"MediaAsset"> | $Enums.ScanStatus
    scanResult?: JsonNullableFilter<"MediaAsset">
    isPublic?: BoolFilter<"MediaAsset"> | boolean
    permissions?: JsonNullableFilter<"MediaAsset">
    viewCount?: IntFilter<"MediaAsset"> | number
    downloadCount?: IntFilter<"MediaAsset"> | number
    tags?: StringNullableListFilter<"MediaAsset">
    sortOrder?: IntFilter<"MediaAsset"> | number
    uploadedBy?: StringNullableFilter<"MediaAsset"> | string | null
    createdAt?: DateTimeFilter<"MediaAsset"> | Date | string
    updatedAt?: DateTimeFilter<"MediaAsset"> | Date | string
    renditions?: AssetRenditionListRelationFilter
    threeD?: XOR<ThreeDAssetNullableRelationFilter, ThreeDAssetWhereInput> | null
    jobs?: ProcessJobListRelationFilter
  }

  export type MediaAssetOrderByWithRelationInput = {
    id?: SortOrder
    kind?: SortOrder
    productId?: SortOrderInput | SortOrder
    variantId?: SortOrderInput | SortOrder
    role?: SortOrderInput | SortOrder
    rawKey?: SortOrder
    processed?: SortOrder
    status?: SortOrder
    width?: SortOrderInput | SortOrder
    height?: SortOrderInput | SortOrder
    format?: SortOrderInput | SortOrder
    sizeBytes?: SortOrderInput | SortOrder
    mimeType?: SortOrderInput | SortOrder
    phash?: SortOrderInput | SortOrder
    palette?: SortOrderInput | SortOrder
    blurhash?: SortOrderInput | SortOrder
    lqipKey?: SortOrderInput | SortOrder
    license?: SortOrderInput | SortOrder
    qcIssues?: SortOrderInput | SortOrder
    qcScore?: SortOrderInput | SortOrder
    scanStatus?: SortOrder
    scanResult?: SortOrderInput | SortOrder
    isPublic?: SortOrder
    permissions?: SortOrderInput | SortOrder
    viewCount?: SortOrder
    downloadCount?: SortOrder
    tags?: SortOrder
    sortOrder?: SortOrder
    uploadedBy?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    renditions?: AssetRenditionOrderByRelationAggregateInput
    threeD?: ThreeDAssetOrderByWithRelationInput
    jobs?: ProcessJobOrderByRelationAggregateInput
  }

  export type MediaAssetWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    rawKey?: string
    AND?: MediaAssetWhereInput | MediaAssetWhereInput[]
    OR?: MediaAssetWhereInput[]
    NOT?: MediaAssetWhereInput | MediaAssetWhereInput[]
    kind?: EnumAssetKindFilter<"MediaAsset"> | $Enums.AssetKind
    productId?: StringNullableFilter<"MediaAsset"> | string | null
    variantId?: StringNullableFilter<"MediaAsset"> | string | null
    role?: EnumAssetRoleNullableFilter<"MediaAsset"> | $Enums.AssetRole | null
    processed?: BoolFilter<"MediaAsset"> | boolean
    status?: EnumAssetStatusFilter<"MediaAsset"> | $Enums.AssetStatus
    width?: IntNullableFilter<"MediaAsset"> | number | null
    height?: IntNullableFilter<"MediaAsset"> | number | null
    format?: StringNullableFilter<"MediaAsset"> | string | null
    sizeBytes?: IntNullableFilter<"MediaAsset"> | number | null
    mimeType?: StringNullableFilter<"MediaAsset"> | string | null
    phash?: StringNullableFilter<"MediaAsset"> | string | null
    palette?: JsonNullableFilter<"MediaAsset">
    blurhash?: StringNullableFilter<"MediaAsset"> | string | null
    lqipKey?: StringNullableFilter<"MediaAsset"> | string | null
    license?: JsonNullableFilter<"MediaAsset">
    qcIssues?: JsonNullableFilter<"MediaAsset">
    qcScore?: FloatNullableFilter<"MediaAsset"> | number | null
    scanStatus?: EnumScanStatusFilter<"MediaAsset"> | $Enums.ScanStatus
    scanResult?: JsonNullableFilter<"MediaAsset">
    isPublic?: BoolFilter<"MediaAsset"> | boolean
    permissions?: JsonNullableFilter<"MediaAsset">
    viewCount?: IntFilter<"MediaAsset"> | number
    downloadCount?: IntFilter<"MediaAsset"> | number
    tags?: StringNullableListFilter<"MediaAsset">
    sortOrder?: IntFilter<"MediaAsset"> | number
    uploadedBy?: StringNullableFilter<"MediaAsset"> | string | null
    createdAt?: DateTimeFilter<"MediaAsset"> | Date | string
    updatedAt?: DateTimeFilter<"MediaAsset"> | Date | string
    renditions?: AssetRenditionListRelationFilter
    threeD?: XOR<ThreeDAssetNullableRelationFilter, ThreeDAssetWhereInput> | null
    jobs?: ProcessJobListRelationFilter
  }, "id" | "rawKey">

  export type MediaAssetOrderByWithAggregationInput = {
    id?: SortOrder
    kind?: SortOrder
    productId?: SortOrderInput | SortOrder
    variantId?: SortOrderInput | SortOrder
    role?: SortOrderInput | SortOrder
    rawKey?: SortOrder
    processed?: SortOrder
    status?: SortOrder
    width?: SortOrderInput | SortOrder
    height?: SortOrderInput | SortOrder
    format?: SortOrderInput | SortOrder
    sizeBytes?: SortOrderInput | SortOrder
    mimeType?: SortOrderInput | SortOrder
    phash?: SortOrderInput | SortOrder
    palette?: SortOrderInput | SortOrder
    blurhash?: SortOrderInput | SortOrder
    lqipKey?: SortOrderInput | SortOrder
    license?: SortOrderInput | SortOrder
    qcIssues?: SortOrderInput | SortOrder
    qcScore?: SortOrderInput | SortOrder
    scanStatus?: SortOrder
    scanResult?: SortOrderInput | SortOrder
    isPublic?: SortOrder
    permissions?: SortOrderInput | SortOrder
    viewCount?: SortOrder
    downloadCount?: SortOrder
    tags?: SortOrder
    sortOrder?: SortOrder
    uploadedBy?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: MediaAssetCountOrderByAggregateInput
    _avg?: MediaAssetAvgOrderByAggregateInput
    _max?: MediaAssetMaxOrderByAggregateInput
    _min?: MediaAssetMinOrderByAggregateInput
    _sum?: MediaAssetSumOrderByAggregateInput
  }

  export type MediaAssetScalarWhereWithAggregatesInput = {
    AND?: MediaAssetScalarWhereWithAggregatesInput | MediaAssetScalarWhereWithAggregatesInput[]
    OR?: MediaAssetScalarWhereWithAggregatesInput[]
    NOT?: MediaAssetScalarWhereWithAggregatesInput | MediaAssetScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"MediaAsset"> | string
    kind?: EnumAssetKindWithAggregatesFilter<"MediaAsset"> | $Enums.AssetKind
    productId?: StringNullableWithAggregatesFilter<"MediaAsset"> | string | null
    variantId?: StringNullableWithAggregatesFilter<"MediaAsset"> | string | null
    role?: EnumAssetRoleNullableWithAggregatesFilter<"MediaAsset"> | $Enums.AssetRole | null
    rawKey?: StringWithAggregatesFilter<"MediaAsset"> | string
    processed?: BoolWithAggregatesFilter<"MediaAsset"> | boolean
    status?: EnumAssetStatusWithAggregatesFilter<"MediaAsset"> | $Enums.AssetStatus
    width?: IntNullableWithAggregatesFilter<"MediaAsset"> | number | null
    height?: IntNullableWithAggregatesFilter<"MediaAsset"> | number | null
    format?: StringNullableWithAggregatesFilter<"MediaAsset"> | string | null
    sizeBytes?: IntNullableWithAggregatesFilter<"MediaAsset"> | number | null
    mimeType?: StringNullableWithAggregatesFilter<"MediaAsset"> | string | null
    phash?: StringNullableWithAggregatesFilter<"MediaAsset"> | string | null
    palette?: JsonNullableWithAggregatesFilter<"MediaAsset">
    blurhash?: StringNullableWithAggregatesFilter<"MediaAsset"> | string | null
    lqipKey?: StringNullableWithAggregatesFilter<"MediaAsset"> | string | null
    license?: JsonNullableWithAggregatesFilter<"MediaAsset">
    qcIssues?: JsonNullableWithAggregatesFilter<"MediaAsset">
    qcScore?: FloatNullableWithAggregatesFilter<"MediaAsset"> | number | null
    scanStatus?: EnumScanStatusWithAggregatesFilter<"MediaAsset"> | $Enums.ScanStatus
    scanResult?: JsonNullableWithAggregatesFilter<"MediaAsset">
    isPublic?: BoolWithAggregatesFilter<"MediaAsset"> | boolean
    permissions?: JsonNullableWithAggregatesFilter<"MediaAsset">
    viewCount?: IntWithAggregatesFilter<"MediaAsset"> | number
    downloadCount?: IntWithAggregatesFilter<"MediaAsset"> | number
    tags?: StringNullableListFilter<"MediaAsset">
    sortOrder?: IntWithAggregatesFilter<"MediaAsset"> | number
    uploadedBy?: StringNullableWithAggregatesFilter<"MediaAsset"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"MediaAsset"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"MediaAsset"> | Date | string
  }

  export type AssetRenditionWhereInput = {
    AND?: AssetRenditionWhereInput | AssetRenditionWhereInput[]
    OR?: AssetRenditionWhereInput[]
    NOT?: AssetRenditionWhereInput | AssetRenditionWhereInput[]
    id?: StringFilter<"AssetRendition"> | string
    assetId?: StringFilter<"AssetRendition"> | string
    key?: StringFilter<"AssetRendition"> | string
    width?: IntNullableFilter<"AssetRendition"> | number | null
    height?: IntNullableFilter<"AssetRendition"> | number | null
    format?: EnumRenditionFormatFilter<"AssetRendition"> | $Enums.RenditionFormat
    sizeBytes?: IntNullableFilter<"AssetRendition"> | number | null
    purpose?: EnumRenditionPurposeFilter<"AssetRendition"> | $Enums.RenditionPurpose
    transform?: JsonNullableFilter<"AssetRendition">
    createdAt?: DateTimeFilter<"AssetRendition"> | Date | string
    asset?: XOR<MediaAssetRelationFilter, MediaAssetWhereInput>
  }

  export type AssetRenditionOrderByWithRelationInput = {
    id?: SortOrder
    assetId?: SortOrder
    key?: SortOrder
    width?: SortOrderInput | SortOrder
    height?: SortOrderInput | SortOrder
    format?: SortOrder
    sizeBytes?: SortOrderInput | SortOrder
    purpose?: SortOrder
    transform?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    asset?: MediaAssetOrderByWithRelationInput
  }

  export type AssetRenditionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    key?: string
    AND?: AssetRenditionWhereInput | AssetRenditionWhereInput[]
    OR?: AssetRenditionWhereInput[]
    NOT?: AssetRenditionWhereInput | AssetRenditionWhereInput[]
    assetId?: StringFilter<"AssetRendition"> | string
    width?: IntNullableFilter<"AssetRendition"> | number | null
    height?: IntNullableFilter<"AssetRendition"> | number | null
    format?: EnumRenditionFormatFilter<"AssetRendition"> | $Enums.RenditionFormat
    sizeBytes?: IntNullableFilter<"AssetRendition"> | number | null
    purpose?: EnumRenditionPurposeFilter<"AssetRendition"> | $Enums.RenditionPurpose
    transform?: JsonNullableFilter<"AssetRendition">
    createdAt?: DateTimeFilter<"AssetRendition"> | Date | string
    asset?: XOR<MediaAssetRelationFilter, MediaAssetWhereInput>
  }, "id" | "key">

  export type AssetRenditionOrderByWithAggregationInput = {
    id?: SortOrder
    assetId?: SortOrder
    key?: SortOrder
    width?: SortOrderInput | SortOrder
    height?: SortOrderInput | SortOrder
    format?: SortOrder
    sizeBytes?: SortOrderInput | SortOrder
    purpose?: SortOrder
    transform?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: AssetRenditionCountOrderByAggregateInput
    _avg?: AssetRenditionAvgOrderByAggregateInput
    _max?: AssetRenditionMaxOrderByAggregateInput
    _min?: AssetRenditionMinOrderByAggregateInput
    _sum?: AssetRenditionSumOrderByAggregateInput
  }

  export type AssetRenditionScalarWhereWithAggregatesInput = {
    AND?: AssetRenditionScalarWhereWithAggregatesInput | AssetRenditionScalarWhereWithAggregatesInput[]
    OR?: AssetRenditionScalarWhereWithAggregatesInput[]
    NOT?: AssetRenditionScalarWhereWithAggregatesInput | AssetRenditionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"AssetRendition"> | string
    assetId?: StringWithAggregatesFilter<"AssetRendition"> | string
    key?: StringWithAggregatesFilter<"AssetRendition"> | string
    width?: IntNullableWithAggregatesFilter<"AssetRendition"> | number | null
    height?: IntNullableWithAggregatesFilter<"AssetRendition"> | number | null
    format?: EnumRenditionFormatWithAggregatesFilter<"AssetRendition"> | $Enums.RenditionFormat
    sizeBytes?: IntNullableWithAggregatesFilter<"AssetRendition"> | number | null
    purpose?: EnumRenditionPurposeWithAggregatesFilter<"AssetRendition"> | $Enums.RenditionPurpose
    transform?: JsonNullableWithAggregatesFilter<"AssetRendition">
    createdAt?: DateTimeWithAggregatesFilter<"AssetRendition"> | Date | string
  }

  export type ThreeDAssetWhereInput = {
    AND?: ThreeDAssetWhereInput | ThreeDAssetWhereInput[]
    OR?: ThreeDAssetWhereInput[]
    NOT?: ThreeDAssetWhereInput | ThreeDAssetWhereInput[]
    id?: StringFilter<"ThreeDAsset"> | string
    assetId?: StringFilter<"ThreeDAsset"> | string
    glbKey?: StringNullableFilter<"ThreeDAsset"> | string | null
    usdzKey?: StringNullableFilter<"ThreeDAsset"> | string | null
    triCount?: IntNullableFilter<"ThreeDAsset"> | number | null
    nodeCount?: IntNullableFilter<"ThreeDAsset"> | number | null
    materialCount?: IntNullableFilter<"ThreeDAsset"> | number | null
    textureCount?: IntNullableFilter<"ThreeDAsset"> | number | null
    widthM?: FloatNullableFilter<"ThreeDAsset"> | number | null
    heightM?: FloatNullableFilter<"ThreeDAsset"> | number | null
    depthM?: FloatNullableFilter<"ThreeDAsset"> | number | null
    volumeM3?: FloatNullableFilter<"ThreeDAsset"> | number | null
    lods?: JsonNullableFilter<"ThreeDAsset">
    materials?: JsonNullableFilter<"ThreeDAsset">
    textures?: JsonNullableFilter<"ThreeDAsset">
    arReady?: BoolFilter<"ThreeDAsset"> | boolean
    arChecks?: JsonNullableFilter<"ThreeDAsset">
    snapshots?: JsonNullableFilter<"ThreeDAsset">
    qcIssues?: JsonNullableFilter<"ThreeDAsset">
    drawCalls?: IntNullableFilter<"ThreeDAsset"> | number | null
    perfBudget?: JsonNullableFilter<"ThreeDAsset">
    createdAt?: DateTimeFilter<"ThreeDAsset"> | Date | string
    updatedAt?: DateTimeFilter<"ThreeDAsset"> | Date | string
    asset?: XOR<MediaAssetRelationFilter, MediaAssetWhereInput>
  }

  export type ThreeDAssetOrderByWithRelationInput = {
    id?: SortOrder
    assetId?: SortOrder
    glbKey?: SortOrderInput | SortOrder
    usdzKey?: SortOrderInput | SortOrder
    triCount?: SortOrderInput | SortOrder
    nodeCount?: SortOrderInput | SortOrder
    materialCount?: SortOrderInput | SortOrder
    textureCount?: SortOrderInput | SortOrder
    widthM?: SortOrderInput | SortOrder
    heightM?: SortOrderInput | SortOrder
    depthM?: SortOrderInput | SortOrder
    volumeM3?: SortOrderInput | SortOrder
    lods?: SortOrderInput | SortOrder
    materials?: SortOrderInput | SortOrder
    textures?: SortOrderInput | SortOrder
    arReady?: SortOrder
    arChecks?: SortOrderInput | SortOrder
    snapshots?: SortOrderInput | SortOrder
    qcIssues?: SortOrderInput | SortOrder
    drawCalls?: SortOrderInput | SortOrder
    perfBudget?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    asset?: MediaAssetOrderByWithRelationInput
  }

  export type ThreeDAssetWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    assetId?: string
    AND?: ThreeDAssetWhereInput | ThreeDAssetWhereInput[]
    OR?: ThreeDAssetWhereInput[]
    NOT?: ThreeDAssetWhereInput | ThreeDAssetWhereInput[]
    glbKey?: StringNullableFilter<"ThreeDAsset"> | string | null
    usdzKey?: StringNullableFilter<"ThreeDAsset"> | string | null
    triCount?: IntNullableFilter<"ThreeDAsset"> | number | null
    nodeCount?: IntNullableFilter<"ThreeDAsset"> | number | null
    materialCount?: IntNullableFilter<"ThreeDAsset"> | number | null
    textureCount?: IntNullableFilter<"ThreeDAsset"> | number | null
    widthM?: FloatNullableFilter<"ThreeDAsset"> | number | null
    heightM?: FloatNullableFilter<"ThreeDAsset"> | number | null
    depthM?: FloatNullableFilter<"ThreeDAsset"> | number | null
    volumeM3?: FloatNullableFilter<"ThreeDAsset"> | number | null
    lods?: JsonNullableFilter<"ThreeDAsset">
    materials?: JsonNullableFilter<"ThreeDAsset">
    textures?: JsonNullableFilter<"ThreeDAsset">
    arReady?: BoolFilter<"ThreeDAsset"> | boolean
    arChecks?: JsonNullableFilter<"ThreeDAsset">
    snapshots?: JsonNullableFilter<"ThreeDAsset">
    qcIssues?: JsonNullableFilter<"ThreeDAsset">
    drawCalls?: IntNullableFilter<"ThreeDAsset"> | number | null
    perfBudget?: JsonNullableFilter<"ThreeDAsset">
    createdAt?: DateTimeFilter<"ThreeDAsset"> | Date | string
    updatedAt?: DateTimeFilter<"ThreeDAsset"> | Date | string
    asset?: XOR<MediaAssetRelationFilter, MediaAssetWhereInput>
  }, "id" | "assetId">

  export type ThreeDAssetOrderByWithAggregationInput = {
    id?: SortOrder
    assetId?: SortOrder
    glbKey?: SortOrderInput | SortOrder
    usdzKey?: SortOrderInput | SortOrder
    triCount?: SortOrderInput | SortOrder
    nodeCount?: SortOrderInput | SortOrder
    materialCount?: SortOrderInput | SortOrder
    textureCount?: SortOrderInput | SortOrder
    widthM?: SortOrderInput | SortOrder
    heightM?: SortOrderInput | SortOrder
    depthM?: SortOrderInput | SortOrder
    volumeM3?: SortOrderInput | SortOrder
    lods?: SortOrderInput | SortOrder
    materials?: SortOrderInput | SortOrder
    textures?: SortOrderInput | SortOrder
    arReady?: SortOrder
    arChecks?: SortOrderInput | SortOrder
    snapshots?: SortOrderInput | SortOrder
    qcIssues?: SortOrderInput | SortOrder
    drawCalls?: SortOrderInput | SortOrder
    perfBudget?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: ThreeDAssetCountOrderByAggregateInput
    _avg?: ThreeDAssetAvgOrderByAggregateInput
    _max?: ThreeDAssetMaxOrderByAggregateInput
    _min?: ThreeDAssetMinOrderByAggregateInput
    _sum?: ThreeDAssetSumOrderByAggregateInput
  }

  export type ThreeDAssetScalarWhereWithAggregatesInput = {
    AND?: ThreeDAssetScalarWhereWithAggregatesInput | ThreeDAssetScalarWhereWithAggregatesInput[]
    OR?: ThreeDAssetScalarWhereWithAggregatesInput[]
    NOT?: ThreeDAssetScalarWhereWithAggregatesInput | ThreeDAssetScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"ThreeDAsset"> | string
    assetId?: StringWithAggregatesFilter<"ThreeDAsset"> | string
    glbKey?: StringNullableWithAggregatesFilter<"ThreeDAsset"> | string | null
    usdzKey?: StringNullableWithAggregatesFilter<"ThreeDAsset"> | string | null
    triCount?: IntNullableWithAggregatesFilter<"ThreeDAsset"> | number | null
    nodeCount?: IntNullableWithAggregatesFilter<"ThreeDAsset"> | number | null
    materialCount?: IntNullableWithAggregatesFilter<"ThreeDAsset"> | number | null
    textureCount?: IntNullableWithAggregatesFilter<"ThreeDAsset"> | number | null
    widthM?: FloatNullableWithAggregatesFilter<"ThreeDAsset"> | number | null
    heightM?: FloatNullableWithAggregatesFilter<"ThreeDAsset"> | number | null
    depthM?: FloatNullableWithAggregatesFilter<"ThreeDAsset"> | number | null
    volumeM3?: FloatNullableWithAggregatesFilter<"ThreeDAsset"> | number | null
    lods?: JsonNullableWithAggregatesFilter<"ThreeDAsset">
    materials?: JsonNullableWithAggregatesFilter<"ThreeDAsset">
    textures?: JsonNullableWithAggregatesFilter<"ThreeDAsset">
    arReady?: BoolWithAggregatesFilter<"ThreeDAsset"> | boolean
    arChecks?: JsonNullableWithAggregatesFilter<"ThreeDAsset">
    snapshots?: JsonNullableWithAggregatesFilter<"ThreeDAsset">
    qcIssues?: JsonNullableWithAggregatesFilter<"ThreeDAsset">
    drawCalls?: IntNullableWithAggregatesFilter<"ThreeDAsset"> | number | null
    perfBudget?: JsonNullableWithAggregatesFilter<"ThreeDAsset">
    createdAt?: DateTimeWithAggregatesFilter<"ThreeDAsset"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"ThreeDAsset"> | Date | string
  }

  export type ProcessJobWhereInput = {
    AND?: ProcessJobWhereInput | ProcessJobWhereInput[]
    OR?: ProcessJobWhereInput[]
    NOT?: ProcessJobWhereInput | ProcessJobWhereInput[]
    id?: StringFilter<"ProcessJob"> | string
    assetId?: StringFilter<"ProcessJob"> | string
    type?: EnumJobTypeFilter<"ProcessJob"> | $Enums.JobType
    state?: EnumJobStateFilter<"ProcessJob"> | $Enums.JobState
    priority?: IntFilter<"ProcessJob"> | number
    attempts?: IntFilter<"ProcessJob"> | number
    maxRetries?: IntFilter<"ProcessJob"> | number
    error?: StringNullableFilter<"ProcessJob"> | string | null
    errorCode?: StringNullableFilter<"ProcessJob"> | string | null
    queuedAt?: DateTimeFilter<"ProcessJob"> | Date | string
    startedAt?: DateTimeNullableFilter<"ProcessJob"> | Date | string | null
    finishedAt?: DateTimeNullableFilter<"ProcessJob"> | Date | string | null
    meta?: JsonNullableFilter<"ProcessJob">
    result?: JsonNullableFilter<"ProcessJob">
    workerId?: StringNullableFilter<"ProcessJob"> | string | null
    asset?: XOR<MediaAssetRelationFilter, MediaAssetWhereInput>
  }

  export type ProcessJobOrderByWithRelationInput = {
    id?: SortOrder
    assetId?: SortOrder
    type?: SortOrder
    state?: SortOrder
    priority?: SortOrder
    attempts?: SortOrder
    maxRetries?: SortOrder
    error?: SortOrderInput | SortOrder
    errorCode?: SortOrderInput | SortOrder
    queuedAt?: SortOrder
    startedAt?: SortOrderInput | SortOrder
    finishedAt?: SortOrderInput | SortOrder
    meta?: SortOrderInput | SortOrder
    result?: SortOrderInput | SortOrder
    workerId?: SortOrderInput | SortOrder
    asset?: MediaAssetOrderByWithRelationInput
  }

  export type ProcessJobWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ProcessJobWhereInput | ProcessJobWhereInput[]
    OR?: ProcessJobWhereInput[]
    NOT?: ProcessJobWhereInput | ProcessJobWhereInput[]
    assetId?: StringFilter<"ProcessJob"> | string
    type?: EnumJobTypeFilter<"ProcessJob"> | $Enums.JobType
    state?: EnumJobStateFilter<"ProcessJob"> | $Enums.JobState
    priority?: IntFilter<"ProcessJob"> | number
    attempts?: IntFilter<"ProcessJob"> | number
    maxRetries?: IntFilter<"ProcessJob"> | number
    error?: StringNullableFilter<"ProcessJob"> | string | null
    errorCode?: StringNullableFilter<"ProcessJob"> | string | null
    queuedAt?: DateTimeFilter<"ProcessJob"> | Date | string
    startedAt?: DateTimeNullableFilter<"ProcessJob"> | Date | string | null
    finishedAt?: DateTimeNullableFilter<"ProcessJob"> | Date | string | null
    meta?: JsonNullableFilter<"ProcessJob">
    result?: JsonNullableFilter<"ProcessJob">
    workerId?: StringNullableFilter<"ProcessJob"> | string | null
    asset?: XOR<MediaAssetRelationFilter, MediaAssetWhereInput>
  }, "id">

  export type ProcessJobOrderByWithAggregationInput = {
    id?: SortOrder
    assetId?: SortOrder
    type?: SortOrder
    state?: SortOrder
    priority?: SortOrder
    attempts?: SortOrder
    maxRetries?: SortOrder
    error?: SortOrderInput | SortOrder
    errorCode?: SortOrderInput | SortOrder
    queuedAt?: SortOrder
    startedAt?: SortOrderInput | SortOrder
    finishedAt?: SortOrderInput | SortOrder
    meta?: SortOrderInput | SortOrder
    result?: SortOrderInput | SortOrder
    workerId?: SortOrderInput | SortOrder
    _count?: ProcessJobCountOrderByAggregateInput
    _avg?: ProcessJobAvgOrderByAggregateInput
    _max?: ProcessJobMaxOrderByAggregateInput
    _min?: ProcessJobMinOrderByAggregateInput
    _sum?: ProcessJobSumOrderByAggregateInput
  }

  export type ProcessJobScalarWhereWithAggregatesInput = {
    AND?: ProcessJobScalarWhereWithAggregatesInput | ProcessJobScalarWhereWithAggregatesInput[]
    OR?: ProcessJobScalarWhereWithAggregatesInput[]
    NOT?: ProcessJobScalarWhereWithAggregatesInput | ProcessJobScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"ProcessJob"> | string
    assetId?: StringWithAggregatesFilter<"ProcessJob"> | string
    type?: EnumJobTypeWithAggregatesFilter<"ProcessJob"> | $Enums.JobType
    state?: EnumJobStateWithAggregatesFilter<"ProcessJob"> | $Enums.JobState
    priority?: IntWithAggregatesFilter<"ProcessJob"> | number
    attempts?: IntWithAggregatesFilter<"ProcessJob"> | number
    maxRetries?: IntWithAggregatesFilter<"ProcessJob"> | number
    error?: StringNullableWithAggregatesFilter<"ProcessJob"> | string | null
    errorCode?: StringNullableWithAggregatesFilter<"ProcessJob"> | string | null
    queuedAt?: DateTimeWithAggregatesFilter<"ProcessJob"> | Date | string
    startedAt?: DateTimeNullableWithAggregatesFilter<"ProcessJob"> | Date | string | null
    finishedAt?: DateTimeNullableWithAggregatesFilter<"ProcessJob"> | Date | string | null
    meta?: JsonNullableWithAggregatesFilter<"ProcessJob">
    result?: JsonNullableWithAggregatesFilter<"ProcessJob">
    workerId?: StringNullableWithAggregatesFilter<"ProcessJob"> | string | null
  }

  export type UploadSessionWhereInput = {
    AND?: UploadSessionWhereInput | UploadSessionWhereInput[]
    OR?: UploadSessionWhereInput[]
    NOT?: UploadSessionWhereInput | UploadSessionWhereInput[]
    id?: StringFilter<"UploadSession"> | string
    assetId?: StringNullableFilter<"UploadSession"> | string | null
    filename?: StringFilter<"UploadSession"> | string
    fileSize?: IntNullableFilter<"UploadSession"> | number | null
    mimeType?: StringFilter<"UploadSession"> | string
    kind?: EnumAssetKindFilter<"UploadSession"> | $Enums.AssetKind
    parUrl?: StringFilter<"UploadSession"> | string
    targetKey?: StringFilter<"UploadSession"> | string
    expiresAt?: DateTimeFilter<"UploadSession"> | Date | string
    status?: EnumUploadStatusFilter<"UploadSession"> | $Enums.UploadStatus
    uploadedAt?: DateTimeNullableFilter<"UploadSession"> | Date | string | null
    userId?: StringFilter<"UploadSession"> | string
    productId?: StringNullableFilter<"UploadSession"> | string | null
    variantId?: StringNullableFilter<"UploadSession"> | string | null
    role?: EnumAssetRoleNullableFilter<"UploadSession"> | $Enums.AssetRole | null
    idempotencyKey?: StringNullableFilter<"UploadSession"> | string | null
    createdAt?: DateTimeFilter<"UploadSession"> | Date | string
    updatedAt?: DateTimeFilter<"UploadSession"> | Date | string
  }

  export type UploadSessionOrderByWithRelationInput = {
    id?: SortOrder
    assetId?: SortOrderInput | SortOrder
    filename?: SortOrder
    fileSize?: SortOrderInput | SortOrder
    mimeType?: SortOrder
    kind?: SortOrder
    parUrl?: SortOrder
    targetKey?: SortOrder
    expiresAt?: SortOrder
    status?: SortOrder
    uploadedAt?: SortOrderInput | SortOrder
    userId?: SortOrder
    productId?: SortOrderInput | SortOrder
    variantId?: SortOrderInput | SortOrder
    role?: SortOrderInput | SortOrder
    idempotencyKey?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UploadSessionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    targetKey?: string
    idempotencyKey?: string
    AND?: UploadSessionWhereInput | UploadSessionWhereInput[]
    OR?: UploadSessionWhereInput[]
    NOT?: UploadSessionWhereInput | UploadSessionWhereInput[]
    assetId?: StringNullableFilter<"UploadSession"> | string | null
    filename?: StringFilter<"UploadSession"> | string
    fileSize?: IntNullableFilter<"UploadSession"> | number | null
    mimeType?: StringFilter<"UploadSession"> | string
    kind?: EnumAssetKindFilter<"UploadSession"> | $Enums.AssetKind
    parUrl?: StringFilter<"UploadSession"> | string
    expiresAt?: DateTimeFilter<"UploadSession"> | Date | string
    status?: EnumUploadStatusFilter<"UploadSession"> | $Enums.UploadStatus
    uploadedAt?: DateTimeNullableFilter<"UploadSession"> | Date | string | null
    userId?: StringFilter<"UploadSession"> | string
    productId?: StringNullableFilter<"UploadSession"> | string | null
    variantId?: StringNullableFilter<"UploadSession"> | string | null
    role?: EnumAssetRoleNullableFilter<"UploadSession"> | $Enums.AssetRole | null
    createdAt?: DateTimeFilter<"UploadSession"> | Date | string
    updatedAt?: DateTimeFilter<"UploadSession"> | Date | string
  }, "id" | "targetKey" | "idempotencyKey">

  export type UploadSessionOrderByWithAggregationInput = {
    id?: SortOrder
    assetId?: SortOrderInput | SortOrder
    filename?: SortOrder
    fileSize?: SortOrderInput | SortOrder
    mimeType?: SortOrder
    kind?: SortOrder
    parUrl?: SortOrder
    targetKey?: SortOrder
    expiresAt?: SortOrder
    status?: SortOrder
    uploadedAt?: SortOrderInput | SortOrder
    userId?: SortOrder
    productId?: SortOrderInput | SortOrder
    variantId?: SortOrderInput | SortOrder
    role?: SortOrderInput | SortOrder
    idempotencyKey?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: UploadSessionCountOrderByAggregateInput
    _avg?: UploadSessionAvgOrderByAggregateInput
    _max?: UploadSessionMaxOrderByAggregateInput
    _min?: UploadSessionMinOrderByAggregateInput
    _sum?: UploadSessionSumOrderByAggregateInput
  }

  export type UploadSessionScalarWhereWithAggregatesInput = {
    AND?: UploadSessionScalarWhereWithAggregatesInput | UploadSessionScalarWhereWithAggregatesInput[]
    OR?: UploadSessionScalarWhereWithAggregatesInput[]
    NOT?: UploadSessionScalarWhereWithAggregatesInput | UploadSessionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"UploadSession"> | string
    assetId?: StringNullableWithAggregatesFilter<"UploadSession"> | string | null
    filename?: StringWithAggregatesFilter<"UploadSession"> | string
    fileSize?: IntNullableWithAggregatesFilter<"UploadSession"> | number | null
    mimeType?: StringWithAggregatesFilter<"UploadSession"> | string
    kind?: EnumAssetKindWithAggregatesFilter<"UploadSession"> | $Enums.AssetKind
    parUrl?: StringWithAggregatesFilter<"UploadSession"> | string
    targetKey?: StringWithAggregatesFilter<"UploadSession"> | string
    expiresAt?: DateTimeWithAggregatesFilter<"UploadSession"> | Date | string
    status?: EnumUploadStatusWithAggregatesFilter<"UploadSession"> | $Enums.UploadStatus
    uploadedAt?: DateTimeNullableWithAggregatesFilter<"UploadSession"> | Date | string | null
    userId?: StringWithAggregatesFilter<"UploadSession"> | string
    productId?: StringNullableWithAggregatesFilter<"UploadSession"> | string | null
    variantId?: StringNullableWithAggregatesFilter<"UploadSession"> | string | null
    role?: EnumAssetRoleNullableWithAggregatesFilter<"UploadSession"> | $Enums.AssetRole | null
    idempotencyKey?: StringNullableWithAggregatesFilter<"UploadSession"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"UploadSession"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"UploadSession"> | Date | string
  }

  export type LicenseRecordWhereInput = {
    AND?: LicenseRecordWhereInput | LicenseRecordWhereInput[]
    OR?: LicenseRecordWhereInput[]
    NOT?: LicenseRecordWhereInput | LicenseRecordWhereInput[]
    id?: StringFilter<"LicenseRecord"> | string
    assetIds?: StringNullableListFilter<"LicenseRecord">
    licenseType?: StringFilter<"LicenseRecord"> | string
    sourceVendor?: StringNullableFilter<"LicenseRecord"> | string | null
    sourceVendorId?: StringNullableFilter<"LicenseRecord"> | string | null
    attribution?: StringNullableFilter<"LicenseRecord"> | string | null
    usageScope?: StringNullableListFilter<"LicenseRecord">
    territory?: StringNullableFilter<"LicenseRecord"> | string | null
    expiresAt?: DateTimeNullableFilter<"LicenseRecord"> | Date | string | null
    proofDocKey?: StringNullableFilter<"LicenseRecord"> | string | null
    alertsSent?: JsonNullableFilter<"LicenseRecord">
    createdBy?: StringFilter<"LicenseRecord"> | string
    createdAt?: DateTimeFilter<"LicenseRecord"> | Date | string
    updatedAt?: DateTimeFilter<"LicenseRecord"> | Date | string
  }

  export type LicenseRecordOrderByWithRelationInput = {
    id?: SortOrder
    assetIds?: SortOrder
    licenseType?: SortOrder
    sourceVendor?: SortOrderInput | SortOrder
    sourceVendorId?: SortOrderInput | SortOrder
    attribution?: SortOrderInput | SortOrder
    usageScope?: SortOrder
    territory?: SortOrderInput | SortOrder
    expiresAt?: SortOrderInput | SortOrder
    proofDocKey?: SortOrderInput | SortOrder
    alertsSent?: SortOrderInput | SortOrder
    createdBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type LicenseRecordWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: LicenseRecordWhereInput | LicenseRecordWhereInput[]
    OR?: LicenseRecordWhereInput[]
    NOT?: LicenseRecordWhereInput | LicenseRecordWhereInput[]
    assetIds?: StringNullableListFilter<"LicenseRecord">
    licenseType?: StringFilter<"LicenseRecord"> | string
    sourceVendor?: StringNullableFilter<"LicenseRecord"> | string | null
    sourceVendorId?: StringNullableFilter<"LicenseRecord"> | string | null
    attribution?: StringNullableFilter<"LicenseRecord"> | string | null
    usageScope?: StringNullableListFilter<"LicenseRecord">
    territory?: StringNullableFilter<"LicenseRecord"> | string | null
    expiresAt?: DateTimeNullableFilter<"LicenseRecord"> | Date | string | null
    proofDocKey?: StringNullableFilter<"LicenseRecord"> | string | null
    alertsSent?: JsonNullableFilter<"LicenseRecord">
    createdBy?: StringFilter<"LicenseRecord"> | string
    createdAt?: DateTimeFilter<"LicenseRecord"> | Date | string
    updatedAt?: DateTimeFilter<"LicenseRecord"> | Date | string
  }, "id">

  export type LicenseRecordOrderByWithAggregationInput = {
    id?: SortOrder
    assetIds?: SortOrder
    licenseType?: SortOrder
    sourceVendor?: SortOrderInput | SortOrder
    sourceVendorId?: SortOrderInput | SortOrder
    attribution?: SortOrderInput | SortOrder
    usageScope?: SortOrder
    territory?: SortOrderInput | SortOrder
    expiresAt?: SortOrderInput | SortOrder
    proofDocKey?: SortOrderInput | SortOrder
    alertsSent?: SortOrderInput | SortOrder
    createdBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: LicenseRecordCountOrderByAggregateInput
    _max?: LicenseRecordMaxOrderByAggregateInput
    _min?: LicenseRecordMinOrderByAggregateInput
  }

  export type LicenseRecordScalarWhereWithAggregatesInput = {
    AND?: LicenseRecordScalarWhereWithAggregatesInput | LicenseRecordScalarWhereWithAggregatesInput[]
    OR?: LicenseRecordScalarWhereWithAggregatesInput[]
    NOT?: LicenseRecordScalarWhereWithAggregatesInput | LicenseRecordScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"LicenseRecord"> | string
    assetIds?: StringNullableListFilter<"LicenseRecord">
    licenseType?: StringWithAggregatesFilter<"LicenseRecord"> | string
    sourceVendor?: StringNullableWithAggregatesFilter<"LicenseRecord"> | string | null
    sourceVendorId?: StringNullableWithAggregatesFilter<"LicenseRecord"> | string | null
    attribution?: StringNullableWithAggregatesFilter<"LicenseRecord"> | string | null
    usageScope?: StringNullableListFilter<"LicenseRecord">
    territory?: StringNullableWithAggregatesFilter<"LicenseRecord"> | string | null
    expiresAt?: DateTimeNullableWithAggregatesFilter<"LicenseRecord"> | Date | string | null
    proofDocKey?: StringNullableWithAggregatesFilter<"LicenseRecord"> | string | null
    alertsSent?: JsonNullableWithAggregatesFilter<"LicenseRecord">
    createdBy?: StringWithAggregatesFilter<"LicenseRecord"> | string
    createdAt?: DateTimeWithAggregatesFilter<"LicenseRecord"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"LicenseRecord"> | Date | string
  }

  export type OutboxEventWhereInput = {
    AND?: OutboxEventWhereInput | OutboxEventWhereInput[]
    OR?: OutboxEventWhereInput[]
    NOT?: OutboxEventWhereInput | OutboxEventWhereInput[]
    id?: StringFilter<"OutboxEvent"> | string
    type?: StringFilter<"OutboxEvent"> | string
    payload?: JsonFilter<"OutboxEvent">
    headers?: JsonNullableFilter<"OutboxEvent">
    published?: BoolFilter<"OutboxEvent"> | boolean
    createdAt?: DateTimeFilter<"OutboxEvent"> | Date | string
    publishedAt?: DateTimeNullableFilter<"OutboxEvent"> | Date | string | null
    retryCount?: IntFilter<"OutboxEvent"> | number
    lastError?: StringNullableFilter<"OutboxEvent"> | string | null
  }

  export type OutboxEventOrderByWithRelationInput = {
    id?: SortOrder
    type?: SortOrder
    payload?: SortOrder
    headers?: SortOrderInput | SortOrder
    published?: SortOrder
    createdAt?: SortOrder
    publishedAt?: SortOrderInput | SortOrder
    retryCount?: SortOrder
    lastError?: SortOrderInput | SortOrder
  }

  export type OutboxEventWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: OutboxEventWhereInput | OutboxEventWhereInput[]
    OR?: OutboxEventWhereInput[]
    NOT?: OutboxEventWhereInput | OutboxEventWhereInput[]
    type?: StringFilter<"OutboxEvent"> | string
    payload?: JsonFilter<"OutboxEvent">
    headers?: JsonNullableFilter<"OutboxEvent">
    published?: BoolFilter<"OutboxEvent"> | boolean
    createdAt?: DateTimeFilter<"OutboxEvent"> | Date | string
    publishedAt?: DateTimeNullableFilter<"OutboxEvent"> | Date | string | null
    retryCount?: IntFilter<"OutboxEvent"> | number
    lastError?: StringNullableFilter<"OutboxEvent"> | string | null
  }, "id">

  export type OutboxEventOrderByWithAggregationInput = {
    id?: SortOrder
    type?: SortOrder
    payload?: SortOrder
    headers?: SortOrderInput | SortOrder
    published?: SortOrder
    createdAt?: SortOrder
    publishedAt?: SortOrderInput | SortOrder
    retryCount?: SortOrder
    lastError?: SortOrderInput | SortOrder
    _count?: OutboxEventCountOrderByAggregateInput
    _avg?: OutboxEventAvgOrderByAggregateInput
    _max?: OutboxEventMaxOrderByAggregateInput
    _min?: OutboxEventMinOrderByAggregateInput
    _sum?: OutboxEventSumOrderByAggregateInput
  }

  export type OutboxEventScalarWhereWithAggregatesInput = {
    AND?: OutboxEventScalarWhereWithAggregatesInput | OutboxEventScalarWhereWithAggregatesInput[]
    OR?: OutboxEventScalarWhereWithAggregatesInput[]
    NOT?: OutboxEventScalarWhereWithAggregatesInput | OutboxEventScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"OutboxEvent"> | string
    type?: StringWithAggregatesFilter<"OutboxEvent"> | string
    payload?: JsonWithAggregatesFilter<"OutboxEvent">
    headers?: JsonNullableWithAggregatesFilter<"OutboxEvent">
    published?: BoolWithAggregatesFilter<"OutboxEvent"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"OutboxEvent"> | Date | string
    publishedAt?: DateTimeNullableWithAggregatesFilter<"OutboxEvent"> | Date | string | null
    retryCount?: IntWithAggregatesFilter<"OutboxEvent"> | number
    lastError?: StringNullableWithAggregatesFilter<"OutboxEvent"> | string | null
  }

  export type MediaAssetCreateInput = {
    id?: string
    kind: $Enums.AssetKind
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    rawKey: string
    processed?: boolean
    status?: $Enums.AssetStatus
    width?: number | null
    height?: number | null
    format?: string | null
    sizeBytes?: number | null
    mimeType?: string | null
    phash?: string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: string | null
    lqipKey?: string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: number | null
    scanStatus?: $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: number
    downloadCount?: number
    tags?: MediaAssetCreatetagsInput | string[]
    sortOrder?: number
    uploadedBy?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    renditions?: AssetRenditionCreateNestedManyWithoutAssetInput
    threeD?: ThreeDAssetCreateNestedOneWithoutAssetInput
    jobs?: ProcessJobCreateNestedManyWithoutAssetInput
  }

  export type MediaAssetUncheckedCreateInput = {
    id?: string
    kind: $Enums.AssetKind
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    rawKey: string
    processed?: boolean
    status?: $Enums.AssetStatus
    width?: number | null
    height?: number | null
    format?: string | null
    sizeBytes?: number | null
    mimeType?: string | null
    phash?: string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: string | null
    lqipKey?: string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: number | null
    scanStatus?: $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: number
    downloadCount?: number
    tags?: MediaAssetCreatetagsInput | string[]
    sortOrder?: number
    uploadedBy?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    renditions?: AssetRenditionUncheckedCreateNestedManyWithoutAssetInput
    threeD?: ThreeDAssetUncheckedCreateNestedOneWithoutAssetInput
    jobs?: ProcessJobUncheckedCreateNestedManyWithoutAssetInput
  }

  export type MediaAssetUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    rawKey?: StringFieldUpdateOperationsInput | string
    processed?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAssetStatusFieldUpdateOperationsInput | $Enums.AssetStatus
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: NullableStringFieldUpdateOperationsInput | string | null
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: NullableStringFieldUpdateOperationsInput | string | null
    phash?: NullableStringFieldUpdateOperationsInput | string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: NullableStringFieldUpdateOperationsInput | string | null
    lqipKey?: NullableStringFieldUpdateOperationsInput | string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: NullableFloatFieldUpdateOperationsInput | number | null
    scanStatus?: EnumScanStatusFieldUpdateOperationsInput | $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: BoolFieldUpdateOperationsInput | boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: IntFieldUpdateOperationsInput | number
    downloadCount?: IntFieldUpdateOperationsInput | number
    tags?: MediaAssetUpdatetagsInput | string[]
    sortOrder?: IntFieldUpdateOperationsInput | number
    uploadedBy?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    renditions?: AssetRenditionUpdateManyWithoutAssetNestedInput
    threeD?: ThreeDAssetUpdateOneWithoutAssetNestedInput
    jobs?: ProcessJobUpdateManyWithoutAssetNestedInput
  }

  export type MediaAssetUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    rawKey?: StringFieldUpdateOperationsInput | string
    processed?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAssetStatusFieldUpdateOperationsInput | $Enums.AssetStatus
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: NullableStringFieldUpdateOperationsInput | string | null
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: NullableStringFieldUpdateOperationsInput | string | null
    phash?: NullableStringFieldUpdateOperationsInput | string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: NullableStringFieldUpdateOperationsInput | string | null
    lqipKey?: NullableStringFieldUpdateOperationsInput | string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: NullableFloatFieldUpdateOperationsInput | number | null
    scanStatus?: EnumScanStatusFieldUpdateOperationsInput | $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: BoolFieldUpdateOperationsInput | boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: IntFieldUpdateOperationsInput | number
    downloadCount?: IntFieldUpdateOperationsInput | number
    tags?: MediaAssetUpdatetagsInput | string[]
    sortOrder?: IntFieldUpdateOperationsInput | number
    uploadedBy?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    renditions?: AssetRenditionUncheckedUpdateManyWithoutAssetNestedInput
    threeD?: ThreeDAssetUncheckedUpdateOneWithoutAssetNestedInput
    jobs?: ProcessJobUncheckedUpdateManyWithoutAssetNestedInput
  }

  export type MediaAssetCreateManyInput = {
    id?: string
    kind: $Enums.AssetKind
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    rawKey: string
    processed?: boolean
    status?: $Enums.AssetStatus
    width?: number | null
    height?: number | null
    format?: string | null
    sizeBytes?: number | null
    mimeType?: string | null
    phash?: string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: string | null
    lqipKey?: string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: number | null
    scanStatus?: $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: number
    downloadCount?: number
    tags?: MediaAssetCreatetagsInput | string[]
    sortOrder?: number
    uploadedBy?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MediaAssetUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    rawKey?: StringFieldUpdateOperationsInput | string
    processed?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAssetStatusFieldUpdateOperationsInput | $Enums.AssetStatus
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: NullableStringFieldUpdateOperationsInput | string | null
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: NullableStringFieldUpdateOperationsInput | string | null
    phash?: NullableStringFieldUpdateOperationsInput | string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: NullableStringFieldUpdateOperationsInput | string | null
    lqipKey?: NullableStringFieldUpdateOperationsInput | string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: NullableFloatFieldUpdateOperationsInput | number | null
    scanStatus?: EnumScanStatusFieldUpdateOperationsInput | $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: BoolFieldUpdateOperationsInput | boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: IntFieldUpdateOperationsInput | number
    downloadCount?: IntFieldUpdateOperationsInput | number
    tags?: MediaAssetUpdatetagsInput | string[]
    sortOrder?: IntFieldUpdateOperationsInput | number
    uploadedBy?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MediaAssetUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    rawKey?: StringFieldUpdateOperationsInput | string
    processed?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAssetStatusFieldUpdateOperationsInput | $Enums.AssetStatus
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: NullableStringFieldUpdateOperationsInput | string | null
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: NullableStringFieldUpdateOperationsInput | string | null
    phash?: NullableStringFieldUpdateOperationsInput | string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: NullableStringFieldUpdateOperationsInput | string | null
    lqipKey?: NullableStringFieldUpdateOperationsInput | string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: NullableFloatFieldUpdateOperationsInput | number | null
    scanStatus?: EnumScanStatusFieldUpdateOperationsInput | $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: BoolFieldUpdateOperationsInput | boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: IntFieldUpdateOperationsInput | number
    downloadCount?: IntFieldUpdateOperationsInput | number
    tags?: MediaAssetUpdatetagsInput | string[]
    sortOrder?: IntFieldUpdateOperationsInput | number
    uploadedBy?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AssetRenditionCreateInput = {
    id?: string
    key: string
    width?: number | null
    height?: number | null
    format: $Enums.RenditionFormat
    sizeBytes?: number | null
    purpose: $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    asset: MediaAssetCreateNestedOneWithoutRenditionsInput
  }

  export type AssetRenditionUncheckedCreateInput = {
    id?: string
    assetId: string
    key: string
    width?: number | null
    height?: number | null
    format: $Enums.RenditionFormat
    sizeBytes?: number | null
    purpose: $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type AssetRenditionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: EnumRenditionFormatFieldUpdateOperationsInput | $Enums.RenditionFormat
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    purpose?: EnumRenditionPurposeFieldUpdateOperationsInput | $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    asset?: MediaAssetUpdateOneRequiredWithoutRenditionsNestedInput
  }

  export type AssetRenditionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetId?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: EnumRenditionFormatFieldUpdateOperationsInput | $Enums.RenditionFormat
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    purpose?: EnumRenditionPurposeFieldUpdateOperationsInput | $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AssetRenditionCreateManyInput = {
    id?: string
    assetId: string
    key: string
    width?: number | null
    height?: number | null
    format: $Enums.RenditionFormat
    sizeBytes?: number | null
    purpose: $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type AssetRenditionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: EnumRenditionFormatFieldUpdateOperationsInput | $Enums.RenditionFormat
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    purpose?: EnumRenditionPurposeFieldUpdateOperationsInput | $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AssetRenditionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetId?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: EnumRenditionFormatFieldUpdateOperationsInput | $Enums.RenditionFormat
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    purpose?: EnumRenditionPurposeFieldUpdateOperationsInput | $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ThreeDAssetCreateInput = {
    id?: string
    glbKey?: string | null
    usdzKey?: string | null
    triCount?: number | null
    nodeCount?: number | null
    materialCount?: number | null
    textureCount?: number | null
    widthM?: number | null
    heightM?: number | null
    depthM?: number | null
    volumeM3?: number | null
    lods?: NullableJsonNullValueInput | InputJsonValue
    materials?: NullableJsonNullValueInput | InputJsonValue
    textures?: NullableJsonNullValueInput | InputJsonValue
    arReady?: boolean
    arChecks?: NullableJsonNullValueInput | InputJsonValue
    snapshots?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    drawCalls?: number | null
    perfBudget?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    asset: MediaAssetCreateNestedOneWithoutThreeDInput
  }

  export type ThreeDAssetUncheckedCreateInput = {
    id?: string
    assetId: string
    glbKey?: string | null
    usdzKey?: string | null
    triCount?: number | null
    nodeCount?: number | null
    materialCount?: number | null
    textureCount?: number | null
    widthM?: number | null
    heightM?: number | null
    depthM?: number | null
    volumeM3?: number | null
    lods?: NullableJsonNullValueInput | InputJsonValue
    materials?: NullableJsonNullValueInput | InputJsonValue
    textures?: NullableJsonNullValueInput | InputJsonValue
    arReady?: boolean
    arChecks?: NullableJsonNullValueInput | InputJsonValue
    snapshots?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    drawCalls?: number | null
    perfBudget?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ThreeDAssetUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    glbKey?: NullableStringFieldUpdateOperationsInput | string | null
    usdzKey?: NullableStringFieldUpdateOperationsInput | string | null
    triCount?: NullableIntFieldUpdateOperationsInput | number | null
    nodeCount?: NullableIntFieldUpdateOperationsInput | number | null
    materialCount?: NullableIntFieldUpdateOperationsInput | number | null
    textureCount?: NullableIntFieldUpdateOperationsInput | number | null
    widthM?: NullableFloatFieldUpdateOperationsInput | number | null
    heightM?: NullableFloatFieldUpdateOperationsInput | number | null
    depthM?: NullableFloatFieldUpdateOperationsInput | number | null
    volumeM3?: NullableFloatFieldUpdateOperationsInput | number | null
    lods?: NullableJsonNullValueInput | InputJsonValue
    materials?: NullableJsonNullValueInput | InputJsonValue
    textures?: NullableJsonNullValueInput | InputJsonValue
    arReady?: BoolFieldUpdateOperationsInput | boolean
    arChecks?: NullableJsonNullValueInput | InputJsonValue
    snapshots?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    drawCalls?: NullableIntFieldUpdateOperationsInput | number | null
    perfBudget?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    asset?: MediaAssetUpdateOneRequiredWithoutThreeDNestedInput
  }

  export type ThreeDAssetUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetId?: StringFieldUpdateOperationsInput | string
    glbKey?: NullableStringFieldUpdateOperationsInput | string | null
    usdzKey?: NullableStringFieldUpdateOperationsInput | string | null
    triCount?: NullableIntFieldUpdateOperationsInput | number | null
    nodeCount?: NullableIntFieldUpdateOperationsInput | number | null
    materialCount?: NullableIntFieldUpdateOperationsInput | number | null
    textureCount?: NullableIntFieldUpdateOperationsInput | number | null
    widthM?: NullableFloatFieldUpdateOperationsInput | number | null
    heightM?: NullableFloatFieldUpdateOperationsInput | number | null
    depthM?: NullableFloatFieldUpdateOperationsInput | number | null
    volumeM3?: NullableFloatFieldUpdateOperationsInput | number | null
    lods?: NullableJsonNullValueInput | InputJsonValue
    materials?: NullableJsonNullValueInput | InputJsonValue
    textures?: NullableJsonNullValueInput | InputJsonValue
    arReady?: BoolFieldUpdateOperationsInput | boolean
    arChecks?: NullableJsonNullValueInput | InputJsonValue
    snapshots?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    drawCalls?: NullableIntFieldUpdateOperationsInput | number | null
    perfBudget?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ThreeDAssetCreateManyInput = {
    id?: string
    assetId: string
    glbKey?: string | null
    usdzKey?: string | null
    triCount?: number | null
    nodeCount?: number | null
    materialCount?: number | null
    textureCount?: number | null
    widthM?: number | null
    heightM?: number | null
    depthM?: number | null
    volumeM3?: number | null
    lods?: NullableJsonNullValueInput | InputJsonValue
    materials?: NullableJsonNullValueInput | InputJsonValue
    textures?: NullableJsonNullValueInput | InputJsonValue
    arReady?: boolean
    arChecks?: NullableJsonNullValueInput | InputJsonValue
    snapshots?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    drawCalls?: number | null
    perfBudget?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ThreeDAssetUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    glbKey?: NullableStringFieldUpdateOperationsInput | string | null
    usdzKey?: NullableStringFieldUpdateOperationsInput | string | null
    triCount?: NullableIntFieldUpdateOperationsInput | number | null
    nodeCount?: NullableIntFieldUpdateOperationsInput | number | null
    materialCount?: NullableIntFieldUpdateOperationsInput | number | null
    textureCount?: NullableIntFieldUpdateOperationsInput | number | null
    widthM?: NullableFloatFieldUpdateOperationsInput | number | null
    heightM?: NullableFloatFieldUpdateOperationsInput | number | null
    depthM?: NullableFloatFieldUpdateOperationsInput | number | null
    volumeM3?: NullableFloatFieldUpdateOperationsInput | number | null
    lods?: NullableJsonNullValueInput | InputJsonValue
    materials?: NullableJsonNullValueInput | InputJsonValue
    textures?: NullableJsonNullValueInput | InputJsonValue
    arReady?: BoolFieldUpdateOperationsInput | boolean
    arChecks?: NullableJsonNullValueInput | InputJsonValue
    snapshots?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    drawCalls?: NullableIntFieldUpdateOperationsInput | number | null
    perfBudget?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ThreeDAssetUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetId?: StringFieldUpdateOperationsInput | string
    glbKey?: NullableStringFieldUpdateOperationsInput | string | null
    usdzKey?: NullableStringFieldUpdateOperationsInput | string | null
    triCount?: NullableIntFieldUpdateOperationsInput | number | null
    nodeCount?: NullableIntFieldUpdateOperationsInput | number | null
    materialCount?: NullableIntFieldUpdateOperationsInput | number | null
    textureCount?: NullableIntFieldUpdateOperationsInput | number | null
    widthM?: NullableFloatFieldUpdateOperationsInput | number | null
    heightM?: NullableFloatFieldUpdateOperationsInput | number | null
    depthM?: NullableFloatFieldUpdateOperationsInput | number | null
    volumeM3?: NullableFloatFieldUpdateOperationsInput | number | null
    lods?: NullableJsonNullValueInput | InputJsonValue
    materials?: NullableJsonNullValueInput | InputJsonValue
    textures?: NullableJsonNullValueInput | InputJsonValue
    arReady?: BoolFieldUpdateOperationsInput | boolean
    arChecks?: NullableJsonNullValueInput | InputJsonValue
    snapshots?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    drawCalls?: NullableIntFieldUpdateOperationsInput | number | null
    perfBudget?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ProcessJobCreateInput = {
    id?: string
    type: $Enums.JobType
    state?: $Enums.JobState
    priority?: number
    attempts?: number
    maxRetries?: number
    error?: string | null
    errorCode?: string | null
    queuedAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: string | null
    asset: MediaAssetCreateNestedOneWithoutJobsInput
  }

  export type ProcessJobUncheckedCreateInput = {
    id?: string
    assetId: string
    type: $Enums.JobType
    state?: $Enums.JobState
    priority?: number
    attempts?: number
    maxRetries?: number
    error?: string | null
    errorCode?: string | null
    queuedAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: string | null
  }

  export type ProcessJobUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumJobTypeFieldUpdateOperationsInput | $Enums.JobType
    state?: EnumJobStateFieldUpdateOperationsInput | $Enums.JobState
    priority?: IntFieldUpdateOperationsInput | number
    attempts?: IntFieldUpdateOperationsInput | number
    maxRetries?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    queuedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
    asset?: MediaAssetUpdateOneRequiredWithoutJobsNestedInput
  }

  export type ProcessJobUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetId?: StringFieldUpdateOperationsInput | string
    type?: EnumJobTypeFieldUpdateOperationsInput | $Enums.JobType
    state?: EnumJobStateFieldUpdateOperationsInput | $Enums.JobState
    priority?: IntFieldUpdateOperationsInput | number
    attempts?: IntFieldUpdateOperationsInput | number
    maxRetries?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    queuedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type ProcessJobCreateManyInput = {
    id?: string
    assetId: string
    type: $Enums.JobType
    state?: $Enums.JobState
    priority?: number
    attempts?: number
    maxRetries?: number
    error?: string | null
    errorCode?: string | null
    queuedAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: string | null
  }

  export type ProcessJobUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumJobTypeFieldUpdateOperationsInput | $Enums.JobType
    state?: EnumJobStateFieldUpdateOperationsInput | $Enums.JobState
    priority?: IntFieldUpdateOperationsInput | number
    attempts?: IntFieldUpdateOperationsInput | number
    maxRetries?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    queuedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type ProcessJobUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetId?: StringFieldUpdateOperationsInput | string
    type?: EnumJobTypeFieldUpdateOperationsInput | $Enums.JobType
    state?: EnumJobStateFieldUpdateOperationsInput | $Enums.JobState
    priority?: IntFieldUpdateOperationsInput | number
    attempts?: IntFieldUpdateOperationsInput | number
    maxRetries?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    queuedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type UploadSessionCreateInput = {
    id?: string
    assetId?: string | null
    filename: string
    fileSize?: number | null
    mimeType: string
    kind: $Enums.AssetKind
    parUrl: string
    targetKey: string
    expiresAt: Date | string
    status?: $Enums.UploadStatus
    uploadedAt?: Date | string | null
    userId: string
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    idempotencyKey?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UploadSessionUncheckedCreateInput = {
    id?: string
    assetId?: string | null
    filename: string
    fileSize?: number | null
    mimeType: string
    kind: $Enums.AssetKind
    parUrl: string
    targetKey: string
    expiresAt: Date | string
    status?: $Enums.UploadStatus
    uploadedAt?: Date | string | null
    userId: string
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    idempotencyKey?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UploadSessionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetId?: NullableStringFieldUpdateOperationsInput | string | null
    filename?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    parUrl?: StringFieldUpdateOperationsInput | string
    targetKey?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: EnumUploadStatusFieldUpdateOperationsInput | $Enums.UploadStatus
    uploadedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    userId?: StringFieldUpdateOperationsInput | string
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    idempotencyKey?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UploadSessionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetId?: NullableStringFieldUpdateOperationsInput | string | null
    filename?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    parUrl?: StringFieldUpdateOperationsInput | string
    targetKey?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: EnumUploadStatusFieldUpdateOperationsInput | $Enums.UploadStatus
    uploadedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    userId?: StringFieldUpdateOperationsInput | string
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    idempotencyKey?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UploadSessionCreateManyInput = {
    id?: string
    assetId?: string | null
    filename: string
    fileSize?: number | null
    mimeType: string
    kind: $Enums.AssetKind
    parUrl: string
    targetKey: string
    expiresAt: Date | string
    status?: $Enums.UploadStatus
    uploadedAt?: Date | string | null
    userId: string
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    idempotencyKey?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UploadSessionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetId?: NullableStringFieldUpdateOperationsInput | string | null
    filename?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    parUrl?: StringFieldUpdateOperationsInput | string
    targetKey?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: EnumUploadStatusFieldUpdateOperationsInput | $Enums.UploadStatus
    uploadedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    userId?: StringFieldUpdateOperationsInput | string
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    idempotencyKey?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UploadSessionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetId?: NullableStringFieldUpdateOperationsInput | string | null
    filename?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    parUrl?: StringFieldUpdateOperationsInput | string
    targetKey?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: EnumUploadStatusFieldUpdateOperationsInput | $Enums.UploadStatus
    uploadedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    userId?: StringFieldUpdateOperationsInput | string
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    idempotencyKey?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LicenseRecordCreateInput = {
    id?: string
    assetIds?: LicenseRecordCreateassetIdsInput | string[]
    licenseType: string
    sourceVendor?: string | null
    sourceVendorId?: string | null
    attribution?: string | null
    usageScope?: LicenseRecordCreateusageScopeInput | string[]
    territory?: string | null
    expiresAt?: Date | string | null
    proofDocKey?: string | null
    alertsSent?: NullableJsonNullValueInput | InputJsonValue
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type LicenseRecordUncheckedCreateInput = {
    id?: string
    assetIds?: LicenseRecordCreateassetIdsInput | string[]
    licenseType: string
    sourceVendor?: string | null
    sourceVendorId?: string | null
    attribution?: string | null
    usageScope?: LicenseRecordCreateusageScopeInput | string[]
    territory?: string | null
    expiresAt?: Date | string | null
    proofDocKey?: string | null
    alertsSent?: NullableJsonNullValueInput | InputJsonValue
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type LicenseRecordUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetIds?: LicenseRecordUpdateassetIdsInput | string[]
    licenseType?: StringFieldUpdateOperationsInput | string
    sourceVendor?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVendorId?: NullableStringFieldUpdateOperationsInput | string | null
    attribution?: NullableStringFieldUpdateOperationsInput | string | null
    usageScope?: LicenseRecordUpdateusageScopeInput | string[]
    territory?: NullableStringFieldUpdateOperationsInput | string | null
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    proofDocKey?: NullableStringFieldUpdateOperationsInput | string | null
    alertsSent?: NullableJsonNullValueInput | InputJsonValue
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LicenseRecordUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetIds?: LicenseRecordUpdateassetIdsInput | string[]
    licenseType?: StringFieldUpdateOperationsInput | string
    sourceVendor?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVendorId?: NullableStringFieldUpdateOperationsInput | string | null
    attribution?: NullableStringFieldUpdateOperationsInput | string | null
    usageScope?: LicenseRecordUpdateusageScopeInput | string[]
    territory?: NullableStringFieldUpdateOperationsInput | string | null
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    proofDocKey?: NullableStringFieldUpdateOperationsInput | string | null
    alertsSent?: NullableJsonNullValueInput | InputJsonValue
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LicenseRecordCreateManyInput = {
    id?: string
    assetIds?: LicenseRecordCreateassetIdsInput | string[]
    licenseType: string
    sourceVendor?: string | null
    sourceVendorId?: string | null
    attribution?: string | null
    usageScope?: LicenseRecordCreateusageScopeInput | string[]
    territory?: string | null
    expiresAt?: Date | string | null
    proofDocKey?: string | null
    alertsSent?: NullableJsonNullValueInput | InputJsonValue
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type LicenseRecordUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetIds?: LicenseRecordUpdateassetIdsInput | string[]
    licenseType?: StringFieldUpdateOperationsInput | string
    sourceVendor?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVendorId?: NullableStringFieldUpdateOperationsInput | string | null
    attribution?: NullableStringFieldUpdateOperationsInput | string | null
    usageScope?: LicenseRecordUpdateusageScopeInput | string[]
    territory?: NullableStringFieldUpdateOperationsInput | string | null
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    proofDocKey?: NullableStringFieldUpdateOperationsInput | string | null
    alertsSent?: NullableJsonNullValueInput | InputJsonValue
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LicenseRecordUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    assetIds?: LicenseRecordUpdateassetIdsInput | string[]
    licenseType?: StringFieldUpdateOperationsInput | string
    sourceVendor?: NullableStringFieldUpdateOperationsInput | string | null
    sourceVendorId?: NullableStringFieldUpdateOperationsInput | string | null
    attribution?: NullableStringFieldUpdateOperationsInput | string | null
    usageScope?: LicenseRecordUpdateusageScopeInput | string[]
    territory?: NullableStringFieldUpdateOperationsInput | string | null
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    proofDocKey?: NullableStringFieldUpdateOperationsInput | string | null
    alertsSent?: NullableJsonNullValueInput | InputJsonValue
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type OutboxEventCreateInput = {
    id?: string
    type: string
    payload: JsonNullValueInput | InputJsonValue
    headers?: NullableJsonNullValueInput | InputJsonValue
    published?: boolean
    createdAt?: Date | string
    publishedAt?: Date | string | null
    retryCount?: number
    lastError?: string | null
  }

  export type OutboxEventUncheckedCreateInput = {
    id?: string
    type: string
    payload: JsonNullValueInput | InputJsonValue
    headers?: NullableJsonNullValueInput | InputJsonValue
    published?: boolean
    createdAt?: Date | string
    publishedAt?: Date | string | null
    retryCount?: number
    lastError?: string | null
  }

  export type OutboxEventUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    payload?: JsonNullValueInput | InputJsonValue
    headers?: NullableJsonNullValueInput | InputJsonValue
    published?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxEventUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    payload?: JsonNullValueInput | InputJsonValue
    headers?: NullableJsonNullValueInput | InputJsonValue
    published?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxEventCreateManyInput = {
    id?: string
    type: string
    payload: JsonNullValueInput | InputJsonValue
    headers?: NullableJsonNullValueInput | InputJsonValue
    published?: boolean
    createdAt?: Date | string
    publishedAt?: Date | string | null
    retryCount?: number
    lastError?: string | null
  }

  export type OutboxEventUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    payload?: JsonNullValueInput | InputJsonValue
    headers?: NullableJsonNullValueInput | InputJsonValue
    published?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxEventUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    payload?: JsonNullValueInput | InputJsonValue
    headers?: NullableJsonNullValueInput | InputJsonValue
    published?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type EnumAssetKindFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetKind | EnumAssetKindFieldRefInput<$PrismaModel>
    in?: $Enums.AssetKind[] | ListEnumAssetKindFieldRefInput<$PrismaModel>
    notIn?: $Enums.AssetKind[] | ListEnumAssetKindFieldRefInput<$PrismaModel>
    not?: NestedEnumAssetKindFilter<$PrismaModel> | $Enums.AssetKind
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type EnumAssetRoleNullableFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetRole | EnumAssetRoleFieldRefInput<$PrismaModel> | null
    in?: $Enums.AssetRole[] | ListEnumAssetRoleFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.AssetRole[] | ListEnumAssetRoleFieldRefInput<$PrismaModel> | null
    not?: NestedEnumAssetRoleNullableFilter<$PrismaModel> | $Enums.AssetRole | null
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type EnumAssetStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetStatus | EnumAssetStatusFieldRefInput<$PrismaModel>
    in?: $Enums.AssetStatus[] | ListEnumAssetStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.AssetStatus[] | ListEnumAssetStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumAssetStatusFilter<$PrismaModel> | $Enums.AssetStatus
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }
  export type JsonNullableFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type FloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type EnumScanStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.ScanStatus | EnumScanStatusFieldRefInput<$PrismaModel>
    in?: $Enums.ScanStatus[] | ListEnumScanStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.ScanStatus[] | ListEnumScanStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumScanStatusFilter<$PrismaModel> | $Enums.ScanStatus
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type StringNullableListFilter<$PrismaModel = never> = {
    equals?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    has?: string | StringFieldRefInput<$PrismaModel> | null
    hasEvery?: string[] | ListStringFieldRefInput<$PrismaModel>
    hasSome?: string[] | ListStringFieldRefInput<$PrismaModel>
    isEmpty?: boolean
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type AssetRenditionListRelationFilter = {
    every?: AssetRenditionWhereInput
    some?: AssetRenditionWhereInput
    none?: AssetRenditionWhereInput
  }

  export type ThreeDAssetNullableRelationFilter = {
    is?: ThreeDAssetWhereInput | null
    isNot?: ThreeDAssetWhereInput | null
  }

  export type ProcessJobListRelationFilter = {
    every?: ProcessJobWhereInput
    some?: ProcessJobWhereInput
    none?: ProcessJobWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type AssetRenditionOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ProcessJobOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type MediaAssetCountOrderByAggregateInput = {
    id?: SortOrder
    kind?: SortOrder
    productId?: SortOrder
    variantId?: SortOrder
    role?: SortOrder
    rawKey?: SortOrder
    processed?: SortOrder
    status?: SortOrder
    width?: SortOrder
    height?: SortOrder
    format?: SortOrder
    sizeBytes?: SortOrder
    mimeType?: SortOrder
    phash?: SortOrder
    palette?: SortOrder
    blurhash?: SortOrder
    lqipKey?: SortOrder
    license?: SortOrder
    qcIssues?: SortOrder
    qcScore?: SortOrder
    scanStatus?: SortOrder
    scanResult?: SortOrder
    isPublic?: SortOrder
    permissions?: SortOrder
    viewCount?: SortOrder
    downloadCount?: SortOrder
    tags?: SortOrder
    sortOrder?: SortOrder
    uploadedBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MediaAssetAvgOrderByAggregateInput = {
    width?: SortOrder
    height?: SortOrder
    sizeBytes?: SortOrder
    qcScore?: SortOrder
    viewCount?: SortOrder
    downloadCount?: SortOrder
    sortOrder?: SortOrder
  }

  export type MediaAssetMaxOrderByAggregateInput = {
    id?: SortOrder
    kind?: SortOrder
    productId?: SortOrder
    variantId?: SortOrder
    role?: SortOrder
    rawKey?: SortOrder
    processed?: SortOrder
    status?: SortOrder
    width?: SortOrder
    height?: SortOrder
    format?: SortOrder
    sizeBytes?: SortOrder
    mimeType?: SortOrder
    phash?: SortOrder
    blurhash?: SortOrder
    lqipKey?: SortOrder
    qcScore?: SortOrder
    scanStatus?: SortOrder
    isPublic?: SortOrder
    viewCount?: SortOrder
    downloadCount?: SortOrder
    sortOrder?: SortOrder
    uploadedBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MediaAssetMinOrderByAggregateInput = {
    id?: SortOrder
    kind?: SortOrder
    productId?: SortOrder
    variantId?: SortOrder
    role?: SortOrder
    rawKey?: SortOrder
    processed?: SortOrder
    status?: SortOrder
    width?: SortOrder
    height?: SortOrder
    format?: SortOrder
    sizeBytes?: SortOrder
    mimeType?: SortOrder
    phash?: SortOrder
    blurhash?: SortOrder
    lqipKey?: SortOrder
    qcScore?: SortOrder
    scanStatus?: SortOrder
    isPublic?: SortOrder
    viewCount?: SortOrder
    downloadCount?: SortOrder
    sortOrder?: SortOrder
    uploadedBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MediaAssetSumOrderByAggregateInput = {
    width?: SortOrder
    height?: SortOrder
    sizeBytes?: SortOrder
    qcScore?: SortOrder
    viewCount?: SortOrder
    downloadCount?: SortOrder
    sortOrder?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type EnumAssetKindWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetKind | EnumAssetKindFieldRefInput<$PrismaModel>
    in?: $Enums.AssetKind[] | ListEnumAssetKindFieldRefInput<$PrismaModel>
    notIn?: $Enums.AssetKind[] | ListEnumAssetKindFieldRefInput<$PrismaModel>
    not?: NestedEnumAssetKindWithAggregatesFilter<$PrismaModel> | $Enums.AssetKind
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumAssetKindFilter<$PrismaModel>
    _max?: NestedEnumAssetKindFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type EnumAssetRoleNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetRole | EnumAssetRoleFieldRefInput<$PrismaModel> | null
    in?: $Enums.AssetRole[] | ListEnumAssetRoleFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.AssetRole[] | ListEnumAssetRoleFieldRefInput<$PrismaModel> | null
    not?: NestedEnumAssetRoleNullableWithAggregatesFilter<$PrismaModel> | $Enums.AssetRole | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedEnumAssetRoleNullableFilter<$PrismaModel>
    _max?: NestedEnumAssetRoleNullableFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type EnumAssetStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetStatus | EnumAssetStatusFieldRefInput<$PrismaModel>
    in?: $Enums.AssetStatus[] | ListEnumAssetStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.AssetStatus[] | ListEnumAssetStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumAssetStatusWithAggregatesFilter<$PrismaModel> | $Enums.AssetStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumAssetStatusFilter<$PrismaModel>
    _max?: NestedEnumAssetStatusFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type FloatNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedFloatNullableFilter<$PrismaModel>
    _min?: NestedFloatNullableFilter<$PrismaModel>
    _max?: NestedFloatNullableFilter<$PrismaModel>
  }

  export type EnumScanStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ScanStatus | EnumScanStatusFieldRefInput<$PrismaModel>
    in?: $Enums.ScanStatus[] | ListEnumScanStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.ScanStatus[] | ListEnumScanStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumScanStatusWithAggregatesFilter<$PrismaModel> | $Enums.ScanStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumScanStatusFilter<$PrismaModel>
    _max?: NestedEnumScanStatusFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type EnumRenditionFormatFilter<$PrismaModel = never> = {
    equals?: $Enums.RenditionFormat | EnumRenditionFormatFieldRefInput<$PrismaModel>
    in?: $Enums.RenditionFormat[] | ListEnumRenditionFormatFieldRefInput<$PrismaModel>
    notIn?: $Enums.RenditionFormat[] | ListEnumRenditionFormatFieldRefInput<$PrismaModel>
    not?: NestedEnumRenditionFormatFilter<$PrismaModel> | $Enums.RenditionFormat
  }

  export type EnumRenditionPurposeFilter<$PrismaModel = never> = {
    equals?: $Enums.RenditionPurpose | EnumRenditionPurposeFieldRefInput<$PrismaModel>
    in?: $Enums.RenditionPurpose[] | ListEnumRenditionPurposeFieldRefInput<$PrismaModel>
    notIn?: $Enums.RenditionPurpose[] | ListEnumRenditionPurposeFieldRefInput<$PrismaModel>
    not?: NestedEnumRenditionPurposeFilter<$PrismaModel> | $Enums.RenditionPurpose
  }

  export type MediaAssetRelationFilter = {
    is?: MediaAssetWhereInput
    isNot?: MediaAssetWhereInput
  }

  export type AssetRenditionCountOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    key?: SortOrder
    width?: SortOrder
    height?: SortOrder
    format?: SortOrder
    sizeBytes?: SortOrder
    purpose?: SortOrder
    transform?: SortOrder
    createdAt?: SortOrder
  }

  export type AssetRenditionAvgOrderByAggregateInput = {
    width?: SortOrder
    height?: SortOrder
    sizeBytes?: SortOrder
  }

  export type AssetRenditionMaxOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    key?: SortOrder
    width?: SortOrder
    height?: SortOrder
    format?: SortOrder
    sizeBytes?: SortOrder
    purpose?: SortOrder
    createdAt?: SortOrder
  }

  export type AssetRenditionMinOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    key?: SortOrder
    width?: SortOrder
    height?: SortOrder
    format?: SortOrder
    sizeBytes?: SortOrder
    purpose?: SortOrder
    createdAt?: SortOrder
  }

  export type AssetRenditionSumOrderByAggregateInput = {
    width?: SortOrder
    height?: SortOrder
    sizeBytes?: SortOrder
  }

  export type EnumRenditionFormatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.RenditionFormat | EnumRenditionFormatFieldRefInput<$PrismaModel>
    in?: $Enums.RenditionFormat[] | ListEnumRenditionFormatFieldRefInput<$PrismaModel>
    notIn?: $Enums.RenditionFormat[] | ListEnumRenditionFormatFieldRefInput<$PrismaModel>
    not?: NestedEnumRenditionFormatWithAggregatesFilter<$PrismaModel> | $Enums.RenditionFormat
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumRenditionFormatFilter<$PrismaModel>
    _max?: NestedEnumRenditionFormatFilter<$PrismaModel>
  }

  export type EnumRenditionPurposeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.RenditionPurpose | EnumRenditionPurposeFieldRefInput<$PrismaModel>
    in?: $Enums.RenditionPurpose[] | ListEnumRenditionPurposeFieldRefInput<$PrismaModel>
    notIn?: $Enums.RenditionPurpose[] | ListEnumRenditionPurposeFieldRefInput<$PrismaModel>
    not?: NestedEnumRenditionPurposeWithAggregatesFilter<$PrismaModel> | $Enums.RenditionPurpose
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumRenditionPurposeFilter<$PrismaModel>
    _max?: NestedEnumRenditionPurposeFilter<$PrismaModel>
  }

  export type ThreeDAssetCountOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    glbKey?: SortOrder
    usdzKey?: SortOrder
    triCount?: SortOrder
    nodeCount?: SortOrder
    materialCount?: SortOrder
    textureCount?: SortOrder
    widthM?: SortOrder
    heightM?: SortOrder
    depthM?: SortOrder
    volumeM3?: SortOrder
    lods?: SortOrder
    materials?: SortOrder
    textures?: SortOrder
    arReady?: SortOrder
    arChecks?: SortOrder
    snapshots?: SortOrder
    qcIssues?: SortOrder
    drawCalls?: SortOrder
    perfBudget?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ThreeDAssetAvgOrderByAggregateInput = {
    triCount?: SortOrder
    nodeCount?: SortOrder
    materialCount?: SortOrder
    textureCount?: SortOrder
    widthM?: SortOrder
    heightM?: SortOrder
    depthM?: SortOrder
    volumeM3?: SortOrder
    drawCalls?: SortOrder
  }

  export type ThreeDAssetMaxOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    glbKey?: SortOrder
    usdzKey?: SortOrder
    triCount?: SortOrder
    nodeCount?: SortOrder
    materialCount?: SortOrder
    textureCount?: SortOrder
    widthM?: SortOrder
    heightM?: SortOrder
    depthM?: SortOrder
    volumeM3?: SortOrder
    arReady?: SortOrder
    drawCalls?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ThreeDAssetMinOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    glbKey?: SortOrder
    usdzKey?: SortOrder
    triCount?: SortOrder
    nodeCount?: SortOrder
    materialCount?: SortOrder
    textureCount?: SortOrder
    widthM?: SortOrder
    heightM?: SortOrder
    depthM?: SortOrder
    volumeM3?: SortOrder
    arReady?: SortOrder
    drawCalls?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ThreeDAssetSumOrderByAggregateInput = {
    triCount?: SortOrder
    nodeCount?: SortOrder
    materialCount?: SortOrder
    textureCount?: SortOrder
    widthM?: SortOrder
    heightM?: SortOrder
    depthM?: SortOrder
    volumeM3?: SortOrder
    drawCalls?: SortOrder
  }

  export type EnumJobTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.JobType | EnumJobTypeFieldRefInput<$PrismaModel>
    in?: $Enums.JobType[] | ListEnumJobTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.JobType[] | ListEnumJobTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumJobTypeFilter<$PrismaModel> | $Enums.JobType
  }

  export type EnumJobStateFilter<$PrismaModel = never> = {
    equals?: $Enums.JobState | EnumJobStateFieldRefInput<$PrismaModel>
    in?: $Enums.JobState[] | ListEnumJobStateFieldRefInput<$PrismaModel>
    notIn?: $Enums.JobState[] | ListEnumJobStateFieldRefInput<$PrismaModel>
    not?: NestedEnumJobStateFilter<$PrismaModel> | $Enums.JobState
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type ProcessJobCountOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    type?: SortOrder
    state?: SortOrder
    priority?: SortOrder
    attempts?: SortOrder
    maxRetries?: SortOrder
    error?: SortOrder
    errorCode?: SortOrder
    queuedAt?: SortOrder
    startedAt?: SortOrder
    finishedAt?: SortOrder
    meta?: SortOrder
    result?: SortOrder
    workerId?: SortOrder
  }

  export type ProcessJobAvgOrderByAggregateInput = {
    priority?: SortOrder
    attempts?: SortOrder
    maxRetries?: SortOrder
  }

  export type ProcessJobMaxOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    type?: SortOrder
    state?: SortOrder
    priority?: SortOrder
    attempts?: SortOrder
    maxRetries?: SortOrder
    error?: SortOrder
    errorCode?: SortOrder
    queuedAt?: SortOrder
    startedAt?: SortOrder
    finishedAt?: SortOrder
    workerId?: SortOrder
  }

  export type ProcessJobMinOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    type?: SortOrder
    state?: SortOrder
    priority?: SortOrder
    attempts?: SortOrder
    maxRetries?: SortOrder
    error?: SortOrder
    errorCode?: SortOrder
    queuedAt?: SortOrder
    startedAt?: SortOrder
    finishedAt?: SortOrder
    workerId?: SortOrder
  }

  export type ProcessJobSumOrderByAggregateInput = {
    priority?: SortOrder
    attempts?: SortOrder
    maxRetries?: SortOrder
  }

  export type EnumJobTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.JobType | EnumJobTypeFieldRefInput<$PrismaModel>
    in?: $Enums.JobType[] | ListEnumJobTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.JobType[] | ListEnumJobTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumJobTypeWithAggregatesFilter<$PrismaModel> | $Enums.JobType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumJobTypeFilter<$PrismaModel>
    _max?: NestedEnumJobTypeFilter<$PrismaModel>
  }

  export type EnumJobStateWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.JobState | EnumJobStateFieldRefInput<$PrismaModel>
    in?: $Enums.JobState[] | ListEnumJobStateFieldRefInput<$PrismaModel>
    notIn?: $Enums.JobState[] | ListEnumJobStateFieldRefInput<$PrismaModel>
    not?: NestedEnumJobStateWithAggregatesFilter<$PrismaModel> | $Enums.JobState
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumJobStateFilter<$PrismaModel>
    _max?: NestedEnumJobStateFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type EnumUploadStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.UploadStatus | EnumUploadStatusFieldRefInput<$PrismaModel>
    in?: $Enums.UploadStatus[] | ListEnumUploadStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.UploadStatus[] | ListEnumUploadStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumUploadStatusFilter<$PrismaModel> | $Enums.UploadStatus
  }

  export type UploadSessionCountOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    filename?: SortOrder
    fileSize?: SortOrder
    mimeType?: SortOrder
    kind?: SortOrder
    parUrl?: SortOrder
    targetKey?: SortOrder
    expiresAt?: SortOrder
    status?: SortOrder
    uploadedAt?: SortOrder
    userId?: SortOrder
    productId?: SortOrder
    variantId?: SortOrder
    role?: SortOrder
    idempotencyKey?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UploadSessionAvgOrderByAggregateInput = {
    fileSize?: SortOrder
  }

  export type UploadSessionMaxOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    filename?: SortOrder
    fileSize?: SortOrder
    mimeType?: SortOrder
    kind?: SortOrder
    parUrl?: SortOrder
    targetKey?: SortOrder
    expiresAt?: SortOrder
    status?: SortOrder
    uploadedAt?: SortOrder
    userId?: SortOrder
    productId?: SortOrder
    variantId?: SortOrder
    role?: SortOrder
    idempotencyKey?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UploadSessionMinOrderByAggregateInput = {
    id?: SortOrder
    assetId?: SortOrder
    filename?: SortOrder
    fileSize?: SortOrder
    mimeType?: SortOrder
    kind?: SortOrder
    parUrl?: SortOrder
    targetKey?: SortOrder
    expiresAt?: SortOrder
    status?: SortOrder
    uploadedAt?: SortOrder
    userId?: SortOrder
    productId?: SortOrder
    variantId?: SortOrder
    role?: SortOrder
    idempotencyKey?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UploadSessionSumOrderByAggregateInput = {
    fileSize?: SortOrder
  }

  export type EnumUploadStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.UploadStatus | EnumUploadStatusFieldRefInput<$PrismaModel>
    in?: $Enums.UploadStatus[] | ListEnumUploadStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.UploadStatus[] | ListEnumUploadStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumUploadStatusWithAggregatesFilter<$PrismaModel> | $Enums.UploadStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumUploadStatusFilter<$PrismaModel>
    _max?: NestedEnumUploadStatusFilter<$PrismaModel>
  }

  export type LicenseRecordCountOrderByAggregateInput = {
    id?: SortOrder
    assetIds?: SortOrder
    licenseType?: SortOrder
    sourceVendor?: SortOrder
    sourceVendorId?: SortOrder
    attribution?: SortOrder
    usageScope?: SortOrder
    territory?: SortOrder
    expiresAt?: SortOrder
    proofDocKey?: SortOrder
    alertsSent?: SortOrder
    createdBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type LicenseRecordMaxOrderByAggregateInput = {
    id?: SortOrder
    licenseType?: SortOrder
    sourceVendor?: SortOrder
    sourceVendorId?: SortOrder
    attribution?: SortOrder
    territory?: SortOrder
    expiresAt?: SortOrder
    proofDocKey?: SortOrder
    createdBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type LicenseRecordMinOrderByAggregateInput = {
    id?: SortOrder
    licenseType?: SortOrder
    sourceVendor?: SortOrder
    sourceVendorId?: SortOrder
    attribution?: SortOrder
    territory?: SortOrder
    expiresAt?: SortOrder
    proofDocKey?: SortOrder
    createdBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }
  export type JsonFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type OutboxEventCountOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    payload?: SortOrder
    headers?: SortOrder
    published?: SortOrder
    createdAt?: SortOrder
    publishedAt?: SortOrder
    retryCount?: SortOrder
    lastError?: SortOrder
  }

  export type OutboxEventAvgOrderByAggregateInput = {
    retryCount?: SortOrder
  }

  export type OutboxEventMaxOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    published?: SortOrder
    createdAt?: SortOrder
    publishedAt?: SortOrder
    retryCount?: SortOrder
    lastError?: SortOrder
  }

  export type OutboxEventMinOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    published?: SortOrder
    createdAt?: SortOrder
    publishedAt?: SortOrder
    retryCount?: SortOrder
    lastError?: SortOrder
  }

  export type OutboxEventSumOrderByAggregateInput = {
    retryCount?: SortOrder
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type MediaAssetCreatetagsInput = {
    set: string[]
  }

  export type AssetRenditionCreateNestedManyWithoutAssetInput = {
    create?: XOR<AssetRenditionCreateWithoutAssetInput, AssetRenditionUncheckedCreateWithoutAssetInput> | AssetRenditionCreateWithoutAssetInput[] | AssetRenditionUncheckedCreateWithoutAssetInput[]
    connectOrCreate?: AssetRenditionCreateOrConnectWithoutAssetInput | AssetRenditionCreateOrConnectWithoutAssetInput[]
    createMany?: AssetRenditionCreateManyAssetInputEnvelope
    connect?: AssetRenditionWhereUniqueInput | AssetRenditionWhereUniqueInput[]
  }

  export type ThreeDAssetCreateNestedOneWithoutAssetInput = {
    create?: XOR<ThreeDAssetCreateWithoutAssetInput, ThreeDAssetUncheckedCreateWithoutAssetInput>
    connectOrCreate?: ThreeDAssetCreateOrConnectWithoutAssetInput
    connect?: ThreeDAssetWhereUniqueInput
  }

  export type ProcessJobCreateNestedManyWithoutAssetInput = {
    create?: XOR<ProcessJobCreateWithoutAssetInput, ProcessJobUncheckedCreateWithoutAssetInput> | ProcessJobCreateWithoutAssetInput[] | ProcessJobUncheckedCreateWithoutAssetInput[]
    connectOrCreate?: ProcessJobCreateOrConnectWithoutAssetInput | ProcessJobCreateOrConnectWithoutAssetInput[]
    createMany?: ProcessJobCreateManyAssetInputEnvelope
    connect?: ProcessJobWhereUniqueInput | ProcessJobWhereUniqueInput[]
  }

  export type AssetRenditionUncheckedCreateNestedManyWithoutAssetInput = {
    create?: XOR<AssetRenditionCreateWithoutAssetInput, AssetRenditionUncheckedCreateWithoutAssetInput> | AssetRenditionCreateWithoutAssetInput[] | AssetRenditionUncheckedCreateWithoutAssetInput[]
    connectOrCreate?: AssetRenditionCreateOrConnectWithoutAssetInput | AssetRenditionCreateOrConnectWithoutAssetInput[]
    createMany?: AssetRenditionCreateManyAssetInputEnvelope
    connect?: AssetRenditionWhereUniqueInput | AssetRenditionWhereUniqueInput[]
  }

  export type ThreeDAssetUncheckedCreateNestedOneWithoutAssetInput = {
    create?: XOR<ThreeDAssetCreateWithoutAssetInput, ThreeDAssetUncheckedCreateWithoutAssetInput>
    connectOrCreate?: ThreeDAssetCreateOrConnectWithoutAssetInput
    connect?: ThreeDAssetWhereUniqueInput
  }

  export type ProcessJobUncheckedCreateNestedManyWithoutAssetInput = {
    create?: XOR<ProcessJobCreateWithoutAssetInput, ProcessJobUncheckedCreateWithoutAssetInput> | ProcessJobCreateWithoutAssetInput[] | ProcessJobUncheckedCreateWithoutAssetInput[]
    connectOrCreate?: ProcessJobCreateOrConnectWithoutAssetInput | ProcessJobCreateOrConnectWithoutAssetInput[]
    createMany?: ProcessJobCreateManyAssetInputEnvelope
    connect?: ProcessJobWhereUniqueInput | ProcessJobWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type EnumAssetKindFieldUpdateOperationsInput = {
    set?: $Enums.AssetKind
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type NullableEnumAssetRoleFieldUpdateOperationsInput = {
    set?: $Enums.AssetRole | null
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type EnumAssetStatusFieldUpdateOperationsInput = {
    set?: $Enums.AssetStatus
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NullableFloatFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type EnumScanStatusFieldUpdateOperationsInput = {
    set?: $Enums.ScanStatus
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type MediaAssetUpdatetagsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type AssetRenditionUpdateManyWithoutAssetNestedInput = {
    create?: XOR<AssetRenditionCreateWithoutAssetInput, AssetRenditionUncheckedCreateWithoutAssetInput> | AssetRenditionCreateWithoutAssetInput[] | AssetRenditionUncheckedCreateWithoutAssetInput[]
    connectOrCreate?: AssetRenditionCreateOrConnectWithoutAssetInput | AssetRenditionCreateOrConnectWithoutAssetInput[]
    upsert?: AssetRenditionUpsertWithWhereUniqueWithoutAssetInput | AssetRenditionUpsertWithWhereUniqueWithoutAssetInput[]
    createMany?: AssetRenditionCreateManyAssetInputEnvelope
    set?: AssetRenditionWhereUniqueInput | AssetRenditionWhereUniqueInput[]
    disconnect?: AssetRenditionWhereUniqueInput | AssetRenditionWhereUniqueInput[]
    delete?: AssetRenditionWhereUniqueInput | AssetRenditionWhereUniqueInput[]
    connect?: AssetRenditionWhereUniqueInput | AssetRenditionWhereUniqueInput[]
    update?: AssetRenditionUpdateWithWhereUniqueWithoutAssetInput | AssetRenditionUpdateWithWhereUniqueWithoutAssetInput[]
    updateMany?: AssetRenditionUpdateManyWithWhereWithoutAssetInput | AssetRenditionUpdateManyWithWhereWithoutAssetInput[]
    deleteMany?: AssetRenditionScalarWhereInput | AssetRenditionScalarWhereInput[]
  }

  export type ThreeDAssetUpdateOneWithoutAssetNestedInput = {
    create?: XOR<ThreeDAssetCreateWithoutAssetInput, ThreeDAssetUncheckedCreateWithoutAssetInput>
    connectOrCreate?: ThreeDAssetCreateOrConnectWithoutAssetInput
    upsert?: ThreeDAssetUpsertWithoutAssetInput
    disconnect?: ThreeDAssetWhereInput | boolean
    delete?: ThreeDAssetWhereInput | boolean
    connect?: ThreeDAssetWhereUniqueInput
    update?: XOR<XOR<ThreeDAssetUpdateToOneWithWhereWithoutAssetInput, ThreeDAssetUpdateWithoutAssetInput>, ThreeDAssetUncheckedUpdateWithoutAssetInput>
  }

  export type ProcessJobUpdateManyWithoutAssetNestedInput = {
    create?: XOR<ProcessJobCreateWithoutAssetInput, ProcessJobUncheckedCreateWithoutAssetInput> | ProcessJobCreateWithoutAssetInput[] | ProcessJobUncheckedCreateWithoutAssetInput[]
    connectOrCreate?: ProcessJobCreateOrConnectWithoutAssetInput | ProcessJobCreateOrConnectWithoutAssetInput[]
    upsert?: ProcessJobUpsertWithWhereUniqueWithoutAssetInput | ProcessJobUpsertWithWhereUniqueWithoutAssetInput[]
    createMany?: ProcessJobCreateManyAssetInputEnvelope
    set?: ProcessJobWhereUniqueInput | ProcessJobWhereUniqueInput[]
    disconnect?: ProcessJobWhereUniqueInput | ProcessJobWhereUniqueInput[]
    delete?: ProcessJobWhereUniqueInput | ProcessJobWhereUniqueInput[]
    connect?: ProcessJobWhereUniqueInput | ProcessJobWhereUniqueInput[]
    update?: ProcessJobUpdateWithWhereUniqueWithoutAssetInput | ProcessJobUpdateWithWhereUniqueWithoutAssetInput[]
    updateMany?: ProcessJobUpdateManyWithWhereWithoutAssetInput | ProcessJobUpdateManyWithWhereWithoutAssetInput[]
    deleteMany?: ProcessJobScalarWhereInput | ProcessJobScalarWhereInput[]
  }

  export type AssetRenditionUncheckedUpdateManyWithoutAssetNestedInput = {
    create?: XOR<AssetRenditionCreateWithoutAssetInput, AssetRenditionUncheckedCreateWithoutAssetInput> | AssetRenditionCreateWithoutAssetInput[] | AssetRenditionUncheckedCreateWithoutAssetInput[]
    connectOrCreate?: AssetRenditionCreateOrConnectWithoutAssetInput | AssetRenditionCreateOrConnectWithoutAssetInput[]
    upsert?: AssetRenditionUpsertWithWhereUniqueWithoutAssetInput | AssetRenditionUpsertWithWhereUniqueWithoutAssetInput[]
    createMany?: AssetRenditionCreateManyAssetInputEnvelope
    set?: AssetRenditionWhereUniqueInput | AssetRenditionWhereUniqueInput[]
    disconnect?: AssetRenditionWhereUniqueInput | AssetRenditionWhereUniqueInput[]
    delete?: AssetRenditionWhereUniqueInput | AssetRenditionWhereUniqueInput[]
    connect?: AssetRenditionWhereUniqueInput | AssetRenditionWhereUniqueInput[]
    update?: AssetRenditionUpdateWithWhereUniqueWithoutAssetInput | AssetRenditionUpdateWithWhereUniqueWithoutAssetInput[]
    updateMany?: AssetRenditionUpdateManyWithWhereWithoutAssetInput | AssetRenditionUpdateManyWithWhereWithoutAssetInput[]
    deleteMany?: AssetRenditionScalarWhereInput | AssetRenditionScalarWhereInput[]
  }

  export type ThreeDAssetUncheckedUpdateOneWithoutAssetNestedInput = {
    create?: XOR<ThreeDAssetCreateWithoutAssetInput, ThreeDAssetUncheckedCreateWithoutAssetInput>
    connectOrCreate?: ThreeDAssetCreateOrConnectWithoutAssetInput
    upsert?: ThreeDAssetUpsertWithoutAssetInput
    disconnect?: ThreeDAssetWhereInput | boolean
    delete?: ThreeDAssetWhereInput | boolean
    connect?: ThreeDAssetWhereUniqueInput
    update?: XOR<XOR<ThreeDAssetUpdateToOneWithWhereWithoutAssetInput, ThreeDAssetUpdateWithoutAssetInput>, ThreeDAssetUncheckedUpdateWithoutAssetInput>
  }

  export type ProcessJobUncheckedUpdateManyWithoutAssetNestedInput = {
    create?: XOR<ProcessJobCreateWithoutAssetInput, ProcessJobUncheckedCreateWithoutAssetInput> | ProcessJobCreateWithoutAssetInput[] | ProcessJobUncheckedCreateWithoutAssetInput[]
    connectOrCreate?: ProcessJobCreateOrConnectWithoutAssetInput | ProcessJobCreateOrConnectWithoutAssetInput[]
    upsert?: ProcessJobUpsertWithWhereUniqueWithoutAssetInput | ProcessJobUpsertWithWhereUniqueWithoutAssetInput[]
    createMany?: ProcessJobCreateManyAssetInputEnvelope
    set?: ProcessJobWhereUniqueInput | ProcessJobWhereUniqueInput[]
    disconnect?: ProcessJobWhereUniqueInput | ProcessJobWhereUniqueInput[]
    delete?: ProcessJobWhereUniqueInput | ProcessJobWhereUniqueInput[]
    connect?: ProcessJobWhereUniqueInput | ProcessJobWhereUniqueInput[]
    update?: ProcessJobUpdateWithWhereUniqueWithoutAssetInput | ProcessJobUpdateWithWhereUniqueWithoutAssetInput[]
    updateMany?: ProcessJobUpdateManyWithWhereWithoutAssetInput | ProcessJobUpdateManyWithWhereWithoutAssetInput[]
    deleteMany?: ProcessJobScalarWhereInput | ProcessJobScalarWhereInput[]
  }

  export type MediaAssetCreateNestedOneWithoutRenditionsInput = {
    create?: XOR<MediaAssetCreateWithoutRenditionsInput, MediaAssetUncheckedCreateWithoutRenditionsInput>
    connectOrCreate?: MediaAssetCreateOrConnectWithoutRenditionsInput
    connect?: MediaAssetWhereUniqueInput
  }

  export type EnumRenditionFormatFieldUpdateOperationsInput = {
    set?: $Enums.RenditionFormat
  }

  export type EnumRenditionPurposeFieldUpdateOperationsInput = {
    set?: $Enums.RenditionPurpose
  }

  export type MediaAssetUpdateOneRequiredWithoutRenditionsNestedInput = {
    create?: XOR<MediaAssetCreateWithoutRenditionsInput, MediaAssetUncheckedCreateWithoutRenditionsInput>
    connectOrCreate?: MediaAssetCreateOrConnectWithoutRenditionsInput
    upsert?: MediaAssetUpsertWithoutRenditionsInput
    connect?: MediaAssetWhereUniqueInput
    update?: XOR<XOR<MediaAssetUpdateToOneWithWhereWithoutRenditionsInput, MediaAssetUpdateWithoutRenditionsInput>, MediaAssetUncheckedUpdateWithoutRenditionsInput>
  }

  export type MediaAssetCreateNestedOneWithoutThreeDInput = {
    create?: XOR<MediaAssetCreateWithoutThreeDInput, MediaAssetUncheckedCreateWithoutThreeDInput>
    connectOrCreate?: MediaAssetCreateOrConnectWithoutThreeDInput
    connect?: MediaAssetWhereUniqueInput
  }

  export type MediaAssetUpdateOneRequiredWithoutThreeDNestedInput = {
    create?: XOR<MediaAssetCreateWithoutThreeDInput, MediaAssetUncheckedCreateWithoutThreeDInput>
    connectOrCreate?: MediaAssetCreateOrConnectWithoutThreeDInput
    upsert?: MediaAssetUpsertWithoutThreeDInput
    connect?: MediaAssetWhereUniqueInput
    update?: XOR<XOR<MediaAssetUpdateToOneWithWhereWithoutThreeDInput, MediaAssetUpdateWithoutThreeDInput>, MediaAssetUncheckedUpdateWithoutThreeDInput>
  }

  export type MediaAssetCreateNestedOneWithoutJobsInput = {
    create?: XOR<MediaAssetCreateWithoutJobsInput, MediaAssetUncheckedCreateWithoutJobsInput>
    connectOrCreate?: MediaAssetCreateOrConnectWithoutJobsInput
    connect?: MediaAssetWhereUniqueInput
  }

  export type EnumJobTypeFieldUpdateOperationsInput = {
    set?: $Enums.JobType
  }

  export type EnumJobStateFieldUpdateOperationsInput = {
    set?: $Enums.JobState
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type MediaAssetUpdateOneRequiredWithoutJobsNestedInput = {
    create?: XOR<MediaAssetCreateWithoutJobsInput, MediaAssetUncheckedCreateWithoutJobsInput>
    connectOrCreate?: MediaAssetCreateOrConnectWithoutJobsInput
    upsert?: MediaAssetUpsertWithoutJobsInput
    connect?: MediaAssetWhereUniqueInput
    update?: XOR<XOR<MediaAssetUpdateToOneWithWhereWithoutJobsInput, MediaAssetUpdateWithoutJobsInput>, MediaAssetUncheckedUpdateWithoutJobsInput>
  }

  export type EnumUploadStatusFieldUpdateOperationsInput = {
    set?: $Enums.UploadStatus
  }

  export type LicenseRecordCreateassetIdsInput = {
    set: string[]
  }

  export type LicenseRecordCreateusageScopeInput = {
    set: string[]
  }

  export type LicenseRecordUpdateassetIdsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type LicenseRecordUpdateusageScopeInput = {
    set?: string[]
    push?: string | string[]
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedEnumAssetKindFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetKind | EnumAssetKindFieldRefInput<$PrismaModel>
    in?: $Enums.AssetKind[] | ListEnumAssetKindFieldRefInput<$PrismaModel>
    notIn?: $Enums.AssetKind[] | ListEnumAssetKindFieldRefInput<$PrismaModel>
    not?: NestedEnumAssetKindFilter<$PrismaModel> | $Enums.AssetKind
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedEnumAssetRoleNullableFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetRole | EnumAssetRoleFieldRefInput<$PrismaModel> | null
    in?: $Enums.AssetRole[] | ListEnumAssetRoleFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.AssetRole[] | ListEnumAssetRoleFieldRefInput<$PrismaModel> | null
    not?: NestedEnumAssetRoleNullableFilter<$PrismaModel> | $Enums.AssetRole | null
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedEnumAssetStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetStatus | EnumAssetStatusFieldRefInput<$PrismaModel>
    in?: $Enums.AssetStatus[] | ListEnumAssetStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.AssetStatus[] | ListEnumAssetStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumAssetStatusFilter<$PrismaModel> | $Enums.AssetStatus
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedEnumScanStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.ScanStatus | EnumScanStatusFieldRefInput<$PrismaModel>
    in?: $Enums.ScanStatus[] | ListEnumScanStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.ScanStatus[] | ListEnumScanStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumScanStatusFilter<$PrismaModel> | $Enums.ScanStatus
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedEnumAssetKindWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetKind | EnumAssetKindFieldRefInput<$PrismaModel>
    in?: $Enums.AssetKind[] | ListEnumAssetKindFieldRefInput<$PrismaModel>
    notIn?: $Enums.AssetKind[] | ListEnumAssetKindFieldRefInput<$PrismaModel>
    not?: NestedEnumAssetKindWithAggregatesFilter<$PrismaModel> | $Enums.AssetKind
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumAssetKindFilter<$PrismaModel>
    _max?: NestedEnumAssetKindFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedEnumAssetRoleNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetRole | EnumAssetRoleFieldRefInput<$PrismaModel> | null
    in?: $Enums.AssetRole[] | ListEnumAssetRoleFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.AssetRole[] | ListEnumAssetRoleFieldRefInput<$PrismaModel> | null
    not?: NestedEnumAssetRoleNullableWithAggregatesFilter<$PrismaModel> | $Enums.AssetRole | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedEnumAssetRoleNullableFilter<$PrismaModel>
    _max?: NestedEnumAssetRoleNullableFilter<$PrismaModel>
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedEnumAssetStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.AssetStatus | EnumAssetStatusFieldRefInput<$PrismaModel>
    in?: $Enums.AssetStatus[] | ListEnumAssetStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.AssetStatus[] | ListEnumAssetStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumAssetStatusWithAggregatesFilter<$PrismaModel> | $Enums.AssetStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumAssetStatusFilter<$PrismaModel>
    _max?: NestedEnumAssetStatusFilter<$PrismaModel>
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedFloatNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedFloatNullableFilter<$PrismaModel>
    _min?: NestedFloatNullableFilter<$PrismaModel>
    _max?: NestedFloatNullableFilter<$PrismaModel>
  }

  export type NestedEnumScanStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ScanStatus | EnumScanStatusFieldRefInput<$PrismaModel>
    in?: $Enums.ScanStatus[] | ListEnumScanStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.ScanStatus[] | ListEnumScanStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumScanStatusWithAggregatesFilter<$PrismaModel> | $Enums.ScanStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumScanStatusFilter<$PrismaModel>
    _max?: NestedEnumScanStatusFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedEnumRenditionFormatFilter<$PrismaModel = never> = {
    equals?: $Enums.RenditionFormat | EnumRenditionFormatFieldRefInput<$PrismaModel>
    in?: $Enums.RenditionFormat[] | ListEnumRenditionFormatFieldRefInput<$PrismaModel>
    notIn?: $Enums.RenditionFormat[] | ListEnumRenditionFormatFieldRefInput<$PrismaModel>
    not?: NestedEnumRenditionFormatFilter<$PrismaModel> | $Enums.RenditionFormat
  }

  export type NestedEnumRenditionPurposeFilter<$PrismaModel = never> = {
    equals?: $Enums.RenditionPurpose | EnumRenditionPurposeFieldRefInput<$PrismaModel>
    in?: $Enums.RenditionPurpose[] | ListEnumRenditionPurposeFieldRefInput<$PrismaModel>
    notIn?: $Enums.RenditionPurpose[] | ListEnumRenditionPurposeFieldRefInput<$PrismaModel>
    not?: NestedEnumRenditionPurposeFilter<$PrismaModel> | $Enums.RenditionPurpose
  }

  export type NestedEnumRenditionFormatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.RenditionFormat | EnumRenditionFormatFieldRefInput<$PrismaModel>
    in?: $Enums.RenditionFormat[] | ListEnumRenditionFormatFieldRefInput<$PrismaModel>
    notIn?: $Enums.RenditionFormat[] | ListEnumRenditionFormatFieldRefInput<$PrismaModel>
    not?: NestedEnumRenditionFormatWithAggregatesFilter<$PrismaModel> | $Enums.RenditionFormat
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumRenditionFormatFilter<$PrismaModel>
    _max?: NestedEnumRenditionFormatFilter<$PrismaModel>
  }

  export type NestedEnumRenditionPurposeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.RenditionPurpose | EnumRenditionPurposeFieldRefInput<$PrismaModel>
    in?: $Enums.RenditionPurpose[] | ListEnumRenditionPurposeFieldRefInput<$PrismaModel>
    notIn?: $Enums.RenditionPurpose[] | ListEnumRenditionPurposeFieldRefInput<$PrismaModel>
    not?: NestedEnumRenditionPurposeWithAggregatesFilter<$PrismaModel> | $Enums.RenditionPurpose
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumRenditionPurposeFilter<$PrismaModel>
    _max?: NestedEnumRenditionPurposeFilter<$PrismaModel>
  }

  export type NestedEnumJobTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.JobType | EnumJobTypeFieldRefInput<$PrismaModel>
    in?: $Enums.JobType[] | ListEnumJobTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.JobType[] | ListEnumJobTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumJobTypeFilter<$PrismaModel> | $Enums.JobType
  }

  export type NestedEnumJobStateFilter<$PrismaModel = never> = {
    equals?: $Enums.JobState | EnumJobStateFieldRefInput<$PrismaModel>
    in?: $Enums.JobState[] | ListEnumJobStateFieldRefInput<$PrismaModel>
    notIn?: $Enums.JobState[] | ListEnumJobStateFieldRefInput<$PrismaModel>
    not?: NestedEnumJobStateFilter<$PrismaModel> | $Enums.JobState
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedEnumJobTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.JobType | EnumJobTypeFieldRefInput<$PrismaModel>
    in?: $Enums.JobType[] | ListEnumJobTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.JobType[] | ListEnumJobTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumJobTypeWithAggregatesFilter<$PrismaModel> | $Enums.JobType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumJobTypeFilter<$PrismaModel>
    _max?: NestedEnumJobTypeFilter<$PrismaModel>
  }

  export type NestedEnumJobStateWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.JobState | EnumJobStateFieldRefInput<$PrismaModel>
    in?: $Enums.JobState[] | ListEnumJobStateFieldRefInput<$PrismaModel>
    notIn?: $Enums.JobState[] | ListEnumJobStateFieldRefInput<$PrismaModel>
    not?: NestedEnumJobStateWithAggregatesFilter<$PrismaModel> | $Enums.JobState
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumJobStateFilter<$PrismaModel>
    _max?: NestedEnumJobStateFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedEnumUploadStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.UploadStatus | EnumUploadStatusFieldRefInput<$PrismaModel>
    in?: $Enums.UploadStatus[] | ListEnumUploadStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.UploadStatus[] | ListEnumUploadStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumUploadStatusFilter<$PrismaModel> | $Enums.UploadStatus
  }

  export type NestedEnumUploadStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.UploadStatus | EnumUploadStatusFieldRefInput<$PrismaModel>
    in?: $Enums.UploadStatus[] | ListEnumUploadStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.UploadStatus[] | ListEnumUploadStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumUploadStatusWithAggregatesFilter<$PrismaModel> | $Enums.UploadStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumUploadStatusFilter<$PrismaModel>
    _max?: NestedEnumUploadStatusFilter<$PrismaModel>
  }
  export type NestedJsonFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type AssetRenditionCreateWithoutAssetInput = {
    id?: string
    key: string
    width?: number | null
    height?: number | null
    format: $Enums.RenditionFormat
    sizeBytes?: number | null
    purpose: $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type AssetRenditionUncheckedCreateWithoutAssetInput = {
    id?: string
    key: string
    width?: number | null
    height?: number | null
    format: $Enums.RenditionFormat
    sizeBytes?: number | null
    purpose: $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type AssetRenditionCreateOrConnectWithoutAssetInput = {
    where: AssetRenditionWhereUniqueInput
    create: XOR<AssetRenditionCreateWithoutAssetInput, AssetRenditionUncheckedCreateWithoutAssetInput>
  }

  export type AssetRenditionCreateManyAssetInputEnvelope = {
    data: AssetRenditionCreateManyAssetInput | AssetRenditionCreateManyAssetInput[]
    skipDuplicates?: boolean
  }

  export type ThreeDAssetCreateWithoutAssetInput = {
    id?: string
    glbKey?: string | null
    usdzKey?: string | null
    triCount?: number | null
    nodeCount?: number | null
    materialCount?: number | null
    textureCount?: number | null
    widthM?: number | null
    heightM?: number | null
    depthM?: number | null
    volumeM3?: number | null
    lods?: NullableJsonNullValueInput | InputJsonValue
    materials?: NullableJsonNullValueInput | InputJsonValue
    textures?: NullableJsonNullValueInput | InputJsonValue
    arReady?: boolean
    arChecks?: NullableJsonNullValueInput | InputJsonValue
    snapshots?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    drawCalls?: number | null
    perfBudget?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ThreeDAssetUncheckedCreateWithoutAssetInput = {
    id?: string
    glbKey?: string | null
    usdzKey?: string | null
    triCount?: number | null
    nodeCount?: number | null
    materialCount?: number | null
    textureCount?: number | null
    widthM?: number | null
    heightM?: number | null
    depthM?: number | null
    volumeM3?: number | null
    lods?: NullableJsonNullValueInput | InputJsonValue
    materials?: NullableJsonNullValueInput | InputJsonValue
    textures?: NullableJsonNullValueInput | InputJsonValue
    arReady?: boolean
    arChecks?: NullableJsonNullValueInput | InputJsonValue
    snapshots?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    drawCalls?: number | null
    perfBudget?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ThreeDAssetCreateOrConnectWithoutAssetInput = {
    where: ThreeDAssetWhereUniqueInput
    create: XOR<ThreeDAssetCreateWithoutAssetInput, ThreeDAssetUncheckedCreateWithoutAssetInput>
  }

  export type ProcessJobCreateWithoutAssetInput = {
    id?: string
    type: $Enums.JobType
    state?: $Enums.JobState
    priority?: number
    attempts?: number
    maxRetries?: number
    error?: string | null
    errorCode?: string | null
    queuedAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: string | null
  }

  export type ProcessJobUncheckedCreateWithoutAssetInput = {
    id?: string
    type: $Enums.JobType
    state?: $Enums.JobState
    priority?: number
    attempts?: number
    maxRetries?: number
    error?: string | null
    errorCode?: string | null
    queuedAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: string | null
  }

  export type ProcessJobCreateOrConnectWithoutAssetInput = {
    where: ProcessJobWhereUniqueInput
    create: XOR<ProcessJobCreateWithoutAssetInput, ProcessJobUncheckedCreateWithoutAssetInput>
  }

  export type ProcessJobCreateManyAssetInputEnvelope = {
    data: ProcessJobCreateManyAssetInput | ProcessJobCreateManyAssetInput[]
    skipDuplicates?: boolean
  }

  export type AssetRenditionUpsertWithWhereUniqueWithoutAssetInput = {
    where: AssetRenditionWhereUniqueInput
    update: XOR<AssetRenditionUpdateWithoutAssetInput, AssetRenditionUncheckedUpdateWithoutAssetInput>
    create: XOR<AssetRenditionCreateWithoutAssetInput, AssetRenditionUncheckedCreateWithoutAssetInput>
  }

  export type AssetRenditionUpdateWithWhereUniqueWithoutAssetInput = {
    where: AssetRenditionWhereUniqueInput
    data: XOR<AssetRenditionUpdateWithoutAssetInput, AssetRenditionUncheckedUpdateWithoutAssetInput>
  }

  export type AssetRenditionUpdateManyWithWhereWithoutAssetInput = {
    where: AssetRenditionScalarWhereInput
    data: XOR<AssetRenditionUpdateManyMutationInput, AssetRenditionUncheckedUpdateManyWithoutAssetInput>
  }

  export type AssetRenditionScalarWhereInput = {
    AND?: AssetRenditionScalarWhereInput | AssetRenditionScalarWhereInput[]
    OR?: AssetRenditionScalarWhereInput[]
    NOT?: AssetRenditionScalarWhereInput | AssetRenditionScalarWhereInput[]
    id?: StringFilter<"AssetRendition"> | string
    assetId?: StringFilter<"AssetRendition"> | string
    key?: StringFilter<"AssetRendition"> | string
    width?: IntNullableFilter<"AssetRendition"> | number | null
    height?: IntNullableFilter<"AssetRendition"> | number | null
    format?: EnumRenditionFormatFilter<"AssetRendition"> | $Enums.RenditionFormat
    sizeBytes?: IntNullableFilter<"AssetRendition"> | number | null
    purpose?: EnumRenditionPurposeFilter<"AssetRendition"> | $Enums.RenditionPurpose
    transform?: JsonNullableFilter<"AssetRendition">
    createdAt?: DateTimeFilter<"AssetRendition"> | Date | string
  }

  export type ThreeDAssetUpsertWithoutAssetInput = {
    update: XOR<ThreeDAssetUpdateWithoutAssetInput, ThreeDAssetUncheckedUpdateWithoutAssetInput>
    create: XOR<ThreeDAssetCreateWithoutAssetInput, ThreeDAssetUncheckedCreateWithoutAssetInput>
    where?: ThreeDAssetWhereInput
  }

  export type ThreeDAssetUpdateToOneWithWhereWithoutAssetInput = {
    where?: ThreeDAssetWhereInput
    data: XOR<ThreeDAssetUpdateWithoutAssetInput, ThreeDAssetUncheckedUpdateWithoutAssetInput>
  }

  export type ThreeDAssetUpdateWithoutAssetInput = {
    id?: StringFieldUpdateOperationsInput | string
    glbKey?: NullableStringFieldUpdateOperationsInput | string | null
    usdzKey?: NullableStringFieldUpdateOperationsInput | string | null
    triCount?: NullableIntFieldUpdateOperationsInput | number | null
    nodeCount?: NullableIntFieldUpdateOperationsInput | number | null
    materialCount?: NullableIntFieldUpdateOperationsInput | number | null
    textureCount?: NullableIntFieldUpdateOperationsInput | number | null
    widthM?: NullableFloatFieldUpdateOperationsInput | number | null
    heightM?: NullableFloatFieldUpdateOperationsInput | number | null
    depthM?: NullableFloatFieldUpdateOperationsInput | number | null
    volumeM3?: NullableFloatFieldUpdateOperationsInput | number | null
    lods?: NullableJsonNullValueInput | InputJsonValue
    materials?: NullableJsonNullValueInput | InputJsonValue
    textures?: NullableJsonNullValueInput | InputJsonValue
    arReady?: BoolFieldUpdateOperationsInput | boolean
    arChecks?: NullableJsonNullValueInput | InputJsonValue
    snapshots?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    drawCalls?: NullableIntFieldUpdateOperationsInput | number | null
    perfBudget?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ThreeDAssetUncheckedUpdateWithoutAssetInput = {
    id?: StringFieldUpdateOperationsInput | string
    glbKey?: NullableStringFieldUpdateOperationsInput | string | null
    usdzKey?: NullableStringFieldUpdateOperationsInput | string | null
    triCount?: NullableIntFieldUpdateOperationsInput | number | null
    nodeCount?: NullableIntFieldUpdateOperationsInput | number | null
    materialCount?: NullableIntFieldUpdateOperationsInput | number | null
    textureCount?: NullableIntFieldUpdateOperationsInput | number | null
    widthM?: NullableFloatFieldUpdateOperationsInput | number | null
    heightM?: NullableFloatFieldUpdateOperationsInput | number | null
    depthM?: NullableFloatFieldUpdateOperationsInput | number | null
    volumeM3?: NullableFloatFieldUpdateOperationsInput | number | null
    lods?: NullableJsonNullValueInput | InputJsonValue
    materials?: NullableJsonNullValueInput | InputJsonValue
    textures?: NullableJsonNullValueInput | InputJsonValue
    arReady?: BoolFieldUpdateOperationsInput | boolean
    arChecks?: NullableJsonNullValueInput | InputJsonValue
    snapshots?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    drawCalls?: NullableIntFieldUpdateOperationsInput | number | null
    perfBudget?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ProcessJobUpsertWithWhereUniqueWithoutAssetInput = {
    where: ProcessJobWhereUniqueInput
    update: XOR<ProcessJobUpdateWithoutAssetInput, ProcessJobUncheckedUpdateWithoutAssetInput>
    create: XOR<ProcessJobCreateWithoutAssetInput, ProcessJobUncheckedCreateWithoutAssetInput>
  }

  export type ProcessJobUpdateWithWhereUniqueWithoutAssetInput = {
    where: ProcessJobWhereUniqueInput
    data: XOR<ProcessJobUpdateWithoutAssetInput, ProcessJobUncheckedUpdateWithoutAssetInput>
  }

  export type ProcessJobUpdateManyWithWhereWithoutAssetInput = {
    where: ProcessJobScalarWhereInput
    data: XOR<ProcessJobUpdateManyMutationInput, ProcessJobUncheckedUpdateManyWithoutAssetInput>
  }

  export type ProcessJobScalarWhereInput = {
    AND?: ProcessJobScalarWhereInput | ProcessJobScalarWhereInput[]
    OR?: ProcessJobScalarWhereInput[]
    NOT?: ProcessJobScalarWhereInput | ProcessJobScalarWhereInput[]
    id?: StringFilter<"ProcessJob"> | string
    assetId?: StringFilter<"ProcessJob"> | string
    type?: EnumJobTypeFilter<"ProcessJob"> | $Enums.JobType
    state?: EnumJobStateFilter<"ProcessJob"> | $Enums.JobState
    priority?: IntFilter<"ProcessJob"> | number
    attempts?: IntFilter<"ProcessJob"> | number
    maxRetries?: IntFilter<"ProcessJob"> | number
    error?: StringNullableFilter<"ProcessJob"> | string | null
    errorCode?: StringNullableFilter<"ProcessJob"> | string | null
    queuedAt?: DateTimeFilter<"ProcessJob"> | Date | string
    startedAt?: DateTimeNullableFilter<"ProcessJob"> | Date | string | null
    finishedAt?: DateTimeNullableFilter<"ProcessJob"> | Date | string | null
    meta?: JsonNullableFilter<"ProcessJob">
    result?: JsonNullableFilter<"ProcessJob">
    workerId?: StringNullableFilter<"ProcessJob"> | string | null
  }

  export type MediaAssetCreateWithoutRenditionsInput = {
    id?: string
    kind: $Enums.AssetKind
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    rawKey: string
    processed?: boolean
    status?: $Enums.AssetStatus
    width?: number | null
    height?: number | null
    format?: string | null
    sizeBytes?: number | null
    mimeType?: string | null
    phash?: string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: string | null
    lqipKey?: string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: number | null
    scanStatus?: $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: number
    downloadCount?: number
    tags?: MediaAssetCreatetagsInput | string[]
    sortOrder?: number
    uploadedBy?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    threeD?: ThreeDAssetCreateNestedOneWithoutAssetInput
    jobs?: ProcessJobCreateNestedManyWithoutAssetInput
  }

  export type MediaAssetUncheckedCreateWithoutRenditionsInput = {
    id?: string
    kind: $Enums.AssetKind
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    rawKey: string
    processed?: boolean
    status?: $Enums.AssetStatus
    width?: number | null
    height?: number | null
    format?: string | null
    sizeBytes?: number | null
    mimeType?: string | null
    phash?: string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: string | null
    lqipKey?: string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: number | null
    scanStatus?: $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: number
    downloadCount?: number
    tags?: MediaAssetCreatetagsInput | string[]
    sortOrder?: number
    uploadedBy?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    threeD?: ThreeDAssetUncheckedCreateNestedOneWithoutAssetInput
    jobs?: ProcessJobUncheckedCreateNestedManyWithoutAssetInput
  }

  export type MediaAssetCreateOrConnectWithoutRenditionsInput = {
    where: MediaAssetWhereUniqueInput
    create: XOR<MediaAssetCreateWithoutRenditionsInput, MediaAssetUncheckedCreateWithoutRenditionsInput>
  }

  export type MediaAssetUpsertWithoutRenditionsInput = {
    update: XOR<MediaAssetUpdateWithoutRenditionsInput, MediaAssetUncheckedUpdateWithoutRenditionsInput>
    create: XOR<MediaAssetCreateWithoutRenditionsInput, MediaAssetUncheckedCreateWithoutRenditionsInput>
    where?: MediaAssetWhereInput
  }

  export type MediaAssetUpdateToOneWithWhereWithoutRenditionsInput = {
    where?: MediaAssetWhereInput
    data: XOR<MediaAssetUpdateWithoutRenditionsInput, MediaAssetUncheckedUpdateWithoutRenditionsInput>
  }

  export type MediaAssetUpdateWithoutRenditionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    rawKey?: StringFieldUpdateOperationsInput | string
    processed?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAssetStatusFieldUpdateOperationsInput | $Enums.AssetStatus
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: NullableStringFieldUpdateOperationsInput | string | null
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: NullableStringFieldUpdateOperationsInput | string | null
    phash?: NullableStringFieldUpdateOperationsInput | string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: NullableStringFieldUpdateOperationsInput | string | null
    lqipKey?: NullableStringFieldUpdateOperationsInput | string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: NullableFloatFieldUpdateOperationsInput | number | null
    scanStatus?: EnumScanStatusFieldUpdateOperationsInput | $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: BoolFieldUpdateOperationsInput | boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: IntFieldUpdateOperationsInput | number
    downloadCount?: IntFieldUpdateOperationsInput | number
    tags?: MediaAssetUpdatetagsInput | string[]
    sortOrder?: IntFieldUpdateOperationsInput | number
    uploadedBy?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    threeD?: ThreeDAssetUpdateOneWithoutAssetNestedInput
    jobs?: ProcessJobUpdateManyWithoutAssetNestedInput
  }

  export type MediaAssetUncheckedUpdateWithoutRenditionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    rawKey?: StringFieldUpdateOperationsInput | string
    processed?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAssetStatusFieldUpdateOperationsInput | $Enums.AssetStatus
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: NullableStringFieldUpdateOperationsInput | string | null
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: NullableStringFieldUpdateOperationsInput | string | null
    phash?: NullableStringFieldUpdateOperationsInput | string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: NullableStringFieldUpdateOperationsInput | string | null
    lqipKey?: NullableStringFieldUpdateOperationsInput | string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: NullableFloatFieldUpdateOperationsInput | number | null
    scanStatus?: EnumScanStatusFieldUpdateOperationsInput | $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: BoolFieldUpdateOperationsInput | boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: IntFieldUpdateOperationsInput | number
    downloadCount?: IntFieldUpdateOperationsInput | number
    tags?: MediaAssetUpdatetagsInput | string[]
    sortOrder?: IntFieldUpdateOperationsInput | number
    uploadedBy?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    threeD?: ThreeDAssetUncheckedUpdateOneWithoutAssetNestedInput
    jobs?: ProcessJobUncheckedUpdateManyWithoutAssetNestedInput
  }

  export type MediaAssetCreateWithoutThreeDInput = {
    id?: string
    kind: $Enums.AssetKind
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    rawKey: string
    processed?: boolean
    status?: $Enums.AssetStatus
    width?: number | null
    height?: number | null
    format?: string | null
    sizeBytes?: number | null
    mimeType?: string | null
    phash?: string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: string | null
    lqipKey?: string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: number | null
    scanStatus?: $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: number
    downloadCount?: number
    tags?: MediaAssetCreatetagsInput | string[]
    sortOrder?: number
    uploadedBy?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    renditions?: AssetRenditionCreateNestedManyWithoutAssetInput
    jobs?: ProcessJobCreateNestedManyWithoutAssetInput
  }

  export type MediaAssetUncheckedCreateWithoutThreeDInput = {
    id?: string
    kind: $Enums.AssetKind
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    rawKey: string
    processed?: boolean
    status?: $Enums.AssetStatus
    width?: number | null
    height?: number | null
    format?: string | null
    sizeBytes?: number | null
    mimeType?: string | null
    phash?: string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: string | null
    lqipKey?: string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: number | null
    scanStatus?: $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: number
    downloadCount?: number
    tags?: MediaAssetCreatetagsInput | string[]
    sortOrder?: number
    uploadedBy?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    renditions?: AssetRenditionUncheckedCreateNestedManyWithoutAssetInput
    jobs?: ProcessJobUncheckedCreateNestedManyWithoutAssetInput
  }

  export type MediaAssetCreateOrConnectWithoutThreeDInput = {
    where: MediaAssetWhereUniqueInput
    create: XOR<MediaAssetCreateWithoutThreeDInput, MediaAssetUncheckedCreateWithoutThreeDInput>
  }

  export type MediaAssetUpsertWithoutThreeDInput = {
    update: XOR<MediaAssetUpdateWithoutThreeDInput, MediaAssetUncheckedUpdateWithoutThreeDInput>
    create: XOR<MediaAssetCreateWithoutThreeDInput, MediaAssetUncheckedCreateWithoutThreeDInput>
    where?: MediaAssetWhereInput
  }

  export type MediaAssetUpdateToOneWithWhereWithoutThreeDInput = {
    where?: MediaAssetWhereInput
    data: XOR<MediaAssetUpdateWithoutThreeDInput, MediaAssetUncheckedUpdateWithoutThreeDInput>
  }

  export type MediaAssetUpdateWithoutThreeDInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    rawKey?: StringFieldUpdateOperationsInput | string
    processed?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAssetStatusFieldUpdateOperationsInput | $Enums.AssetStatus
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: NullableStringFieldUpdateOperationsInput | string | null
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: NullableStringFieldUpdateOperationsInput | string | null
    phash?: NullableStringFieldUpdateOperationsInput | string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: NullableStringFieldUpdateOperationsInput | string | null
    lqipKey?: NullableStringFieldUpdateOperationsInput | string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: NullableFloatFieldUpdateOperationsInput | number | null
    scanStatus?: EnumScanStatusFieldUpdateOperationsInput | $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: BoolFieldUpdateOperationsInput | boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: IntFieldUpdateOperationsInput | number
    downloadCount?: IntFieldUpdateOperationsInput | number
    tags?: MediaAssetUpdatetagsInput | string[]
    sortOrder?: IntFieldUpdateOperationsInput | number
    uploadedBy?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    renditions?: AssetRenditionUpdateManyWithoutAssetNestedInput
    jobs?: ProcessJobUpdateManyWithoutAssetNestedInput
  }

  export type MediaAssetUncheckedUpdateWithoutThreeDInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    rawKey?: StringFieldUpdateOperationsInput | string
    processed?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAssetStatusFieldUpdateOperationsInput | $Enums.AssetStatus
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: NullableStringFieldUpdateOperationsInput | string | null
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: NullableStringFieldUpdateOperationsInput | string | null
    phash?: NullableStringFieldUpdateOperationsInput | string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: NullableStringFieldUpdateOperationsInput | string | null
    lqipKey?: NullableStringFieldUpdateOperationsInput | string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: NullableFloatFieldUpdateOperationsInput | number | null
    scanStatus?: EnumScanStatusFieldUpdateOperationsInput | $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: BoolFieldUpdateOperationsInput | boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: IntFieldUpdateOperationsInput | number
    downloadCount?: IntFieldUpdateOperationsInput | number
    tags?: MediaAssetUpdatetagsInput | string[]
    sortOrder?: IntFieldUpdateOperationsInput | number
    uploadedBy?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    renditions?: AssetRenditionUncheckedUpdateManyWithoutAssetNestedInput
    jobs?: ProcessJobUncheckedUpdateManyWithoutAssetNestedInput
  }

  export type MediaAssetCreateWithoutJobsInput = {
    id?: string
    kind: $Enums.AssetKind
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    rawKey: string
    processed?: boolean
    status?: $Enums.AssetStatus
    width?: number | null
    height?: number | null
    format?: string | null
    sizeBytes?: number | null
    mimeType?: string | null
    phash?: string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: string | null
    lqipKey?: string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: number | null
    scanStatus?: $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: number
    downloadCount?: number
    tags?: MediaAssetCreatetagsInput | string[]
    sortOrder?: number
    uploadedBy?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    renditions?: AssetRenditionCreateNestedManyWithoutAssetInput
    threeD?: ThreeDAssetCreateNestedOneWithoutAssetInput
  }

  export type MediaAssetUncheckedCreateWithoutJobsInput = {
    id?: string
    kind: $Enums.AssetKind
    productId?: string | null
    variantId?: string | null
    role?: $Enums.AssetRole | null
    rawKey: string
    processed?: boolean
    status?: $Enums.AssetStatus
    width?: number | null
    height?: number | null
    format?: string | null
    sizeBytes?: number | null
    mimeType?: string | null
    phash?: string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: string | null
    lqipKey?: string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: number | null
    scanStatus?: $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: number
    downloadCount?: number
    tags?: MediaAssetCreatetagsInput | string[]
    sortOrder?: number
    uploadedBy?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    renditions?: AssetRenditionUncheckedCreateNestedManyWithoutAssetInput
    threeD?: ThreeDAssetUncheckedCreateNestedOneWithoutAssetInput
  }

  export type MediaAssetCreateOrConnectWithoutJobsInput = {
    where: MediaAssetWhereUniqueInput
    create: XOR<MediaAssetCreateWithoutJobsInput, MediaAssetUncheckedCreateWithoutJobsInput>
  }

  export type MediaAssetUpsertWithoutJobsInput = {
    update: XOR<MediaAssetUpdateWithoutJobsInput, MediaAssetUncheckedUpdateWithoutJobsInput>
    create: XOR<MediaAssetCreateWithoutJobsInput, MediaAssetUncheckedCreateWithoutJobsInput>
    where?: MediaAssetWhereInput
  }

  export type MediaAssetUpdateToOneWithWhereWithoutJobsInput = {
    where?: MediaAssetWhereInput
    data: XOR<MediaAssetUpdateWithoutJobsInput, MediaAssetUncheckedUpdateWithoutJobsInput>
  }

  export type MediaAssetUpdateWithoutJobsInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    rawKey?: StringFieldUpdateOperationsInput | string
    processed?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAssetStatusFieldUpdateOperationsInput | $Enums.AssetStatus
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: NullableStringFieldUpdateOperationsInput | string | null
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: NullableStringFieldUpdateOperationsInput | string | null
    phash?: NullableStringFieldUpdateOperationsInput | string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: NullableStringFieldUpdateOperationsInput | string | null
    lqipKey?: NullableStringFieldUpdateOperationsInput | string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: NullableFloatFieldUpdateOperationsInput | number | null
    scanStatus?: EnumScanStatusFieldUpdateOperationsInput | $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: BoolFieldUpdateOperationsInput | boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: IntFieldUpdateOperationsInput | number
    downloadCount?: IntFieldUpdateOperationsInput | number
    tags?: MediaAssetUpdatetagsInput | string[]
    sortOrder?: IntFieldUpdateOperationsInput | number
    uploadedBy?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    renditions?: AssetRenditionUpdateManyWithoutAssetNestedInput
    threeD?: ThreeDAssetUpdateOneWithoutAssetNestedInput
  }

  export type MediaAssetUncheckedUpdateWithoutJobsInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: EnumAssetKindFieldUpdateOperationsInput | $Enums.AssetKind
    productId?: NullableStringFieldUpdateOperationsInput | string | null
    variantId?: NullableStringFieldUpdateOperationsInput | string | null
    role?: NullableEnumAssetRoleFieldUpdateOperationsInput | $Enums.AssetRole | null
    rawKey?: StringFieldUpdateOperationsInput | string
    processed?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumAssetStatusFieldUpdateOperationsInput | $Enums.AssetStatus
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: NullableStringFieldUpdateOperationsInput | string | null
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    mimeType?: NullableStringFieldUpdateOperationsInput | string | null
    phash?: NullableStringFieldUpdateOperationsInput | string | null
    palette?: NullableJsonNullValueInput | InputJsonValue
    blurhash?: NullableStringFieldUpdateOperationsInput | string | null
    lqipKey?: NullableStringFieldUpdateOperationsInput | string | null
    license?: NullableJsonNullValueInput | InputJsonValue
    qcIssues?: NullableJsonNullValueInput | InputJsonValue
    qcScore?: NullableFloatFieldUpdateOperationsInput | number | null
    scanStatus?: EnumScanStatusFieldUpdateOperationsInput | $Enums.ScanStatus
    scanResult?: NullableJsonNullValueInput | InputJsonValue
    isPublic?: BoolFieldUpdateOperationsInput | boolean
    permissions?: NullableJsonNullValueInput | InputJsonValue
    viewCount?: IntFieldUpdateOperationsInput | number
    downloadCount?: IntFieldUpdateOperationsInput | number
    tags?: MediaAssetUpdatetagsInput | string[]
    sortOrder?: IntFieldUpdateOperationsInput | number
    uploadedBy?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    renditions?: AssetRenditionUncheckedUpdateManyWithoutAssetNestedInput
    threeD?: ThreeDAssetUncheckedUpdateOneWithoutAssetNestedInput
  }

  export type AssetRenditionCreateManyAssetInput = {
    id?: string
    key: string
    width?: number | null
    height?: number | null
    format: $Enums.RenditionFormat
    sizeBytes?: number | null
    purpose: $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type ProcessJobCreateManyAssetInput = {
    id?: string
    type: $Enums.JobType
    state?: $Enums.JobState
    priority?: number
    attempts?: number
    maxRetries?: number
    error?: string | null
    errorCode?: string | null
    queuedAt?: Date | string
    startedAt?: Date | string | null
    finishedAt?: Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: string | null
  }

  export type AssetRenditionUpdateWithoutAssetInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: EnumRenditionFormatFieldUpdateOperationsInput | $Enums.RenditionFormat
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    purpose?: EnumRenditionPurposeFieldUpdateOperationsInput | $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AssetRenditionUncheckedUpdateWithoutAssetInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: EnumRenditionFormatFieldUpdateOperationsInput | $Enums.RenditionFormat
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    purpose?: EnumRenditionPurposeFieldUpdateOperationsInput | $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AssetRenditionUncheckedUpdateManyWithoutAssetInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    width?: NullableIntFieldUpdateOperationsInput | number | null
    height?: NullableIntFieldUpdateOperationsInput | number | null
    format?: EnumRenditionFormatFieldUpdateOperationsInput | $Enums.RenditionFormat
    sizeBytes?: NullableIntFieldUpdateOperationsInput | number | null
    purpose?: EnumRenditionPurposeFieldUpdateOperationsInput | $Enums.RenditionPurpose
    transform?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ProcessJobUpdateWithoutAssetInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumJobTypeFieldUpdateOperationsInput | $Enums.JobType
    state?: EnumJobStateFieldUpdateOperationsInput | $Enums.JobState
    priority?: IntFieldUpdateOperationsInput | number
    attempts?: IntFieldUpdateOperationsInput | number
    maxRetries?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    queuedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type ProcessJobUncheckedUpdateWithoutAssetInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumJobTypeFieldUpdateOperationsInput | $Enums.JobType
    state?: EnumJobStateFieldUpdateOperationsInput | $Enums.JobState
    priority?: IntFieldUpdateOperationsInput | number
    attempts?: IntFieldUpdateOperationsInput | number
    maxRetries?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    queuedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type ProcessJobUncheckedUpdateManyWithoutAssetInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumJobTypeFieldUpdateOperationsInput | $Enums.JobType
    state?: EnumJobStateFieldUpdateOperationsInput | $Enums.JobState
    priority?: IntFieldUpdateOperationsInput | number
    attempts?: IntFieldUpdateOperationsInput | number
    maxRetries?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    queuedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    finishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    meta?: NullableJsonNullValueInput | InputJsonValue
    result?: NullableJsonNullValueInput | InputJsonValue
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
  }



  /**
   * Aliases for legacy arg types
   */
    /**
     * @deprecated Use MediaAssetCountOutputTypeDefaultArgs instead
     */
    export type MediaAssetCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = MediaAssetCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use MediaAssetDefaultArgs instead
     */
    export type MediaAssetArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = MediaAssetDefaultArgs<ExtArgs>
    /**
     * @deprecated Use AssetRenditionDefaultArgs instead
     */
    export type AssetRenditionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = AssetRenditionDefaultArgs<ExtArgs>
    /**
     * @deprecated Use ThreeDAssetDefaultArgs instead
     */
    export type ThreeDAssetArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = ThreeDAssetDefaultArgs<ExtArgs>
    /**
     * @deprecated Use ProcessJobDefaultArgs instead
     */
    export type ProcessJobArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = ProcessJobDefaultArgs<ExtArgs>
    /**
     * @deprecated Use UploadSessionDefaultArgs instead
     */
    export type UploadSessionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = UploadSessionDefaultArgs<ExtArgs>
    /**
     * @deprecated Use LicenseRecordDefaultArgs instead
     */
    export type LicenseRecordArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = LicenseRecordDefaultArgs<ExtArgs>
    /**
     * @deprecated Use OutboxEventDefaultArgs instead
     */
    export type OutboxEventArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = OutboxEventDefaultArgs<ExtArgs>

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}