"use strict";
/**
 * Project Repository Interface (Domain Layer)
 *
 * Defines the contract for project data access following the Repository Pattern.
 * This abstraction allows the domain and application layers to be independent
 * of the specific data access technology (Prisma, TypeORM, etc.).
 *
 * Benefits:
 * - Testability: Can mock repository in unit tests
 * - Flexibility: Can swap implementations without changing business logic
 * - Clean Architecture: Domain layer depends on abstractions, not implementations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_REPOSITORY = void 0;
/**
 * Dependency Injection token for ProjectRepository
 * Used in NestJS providers to inject the correct implementation
 */
exports.PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');
//# sourceMappingURL=project.repository.interface.js.map