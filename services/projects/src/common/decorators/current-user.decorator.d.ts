export interface CurrentUser {
    id: string;
    email: string;
    role: 'admin' | 'designer' | 'client' | 'contractor';
    name?: string;
}
export declare const GetCurrentUser: (...dataOrPipes: (import("@nestjs/common").PipeTransform<any, any> | import("@nestjs/common").Type<import("@nestjs/common").PipeTransform<any, any>> | keyof CurrentUser | undefined)[]) => ParameterDecorator;
//# sourceMappingURL=current-user.decorator.d.ts.map