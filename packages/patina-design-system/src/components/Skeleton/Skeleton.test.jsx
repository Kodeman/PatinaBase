"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const Skeleton_1 = require("./Skeleton");
(0, vitest_1.describe)('Skeleton', () => {
    (0, vitest_1.it)('renders skeleton element', () => {
        (0, react_1.render)(<Skeleton_1.Skeleton />);
        (0, vitest_1.expect)(react_1.screen.getByRole('status')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Loading...')).toHaveClass('sr-only');
    });
    (0, vitest_1.it)('renders different variants', () => {
        const { rerender, container } = (0, react_1.render)(<Skeleton_1.Skeleton variant="text"/>);
        (0, vitest_1.expect)(container.querySelector('[role="status"]')).toHaveClass('h-4', 'w-full', 'rounded');
        rerender(<Skeleton_1.Skeleton variant="circular"/>);
        (0, vitest_1.expect)(container.querySelector('[role="status"]')).toHaveClass('rounded-full');
        rerender(<Skeleton_1.Skeleton variant="rectangular"/>);
        (0, vitest_1.expect)(container.querySelector('[role="status"]')).toHaveClass('rounded-md');
    });
    (0, vitest_1.it)('applies pulse animation by default', () => {
        const { container } = (0, react_1.render)(<Skeleton_1.Skeleton />);
        (0, vitest_1.expect)(container.querySelector('[role="status"]')).toHaveClass('animate-pulse');
    });
    (0, vitest_1.it)('applies wave animation', () => {
        const { container } = (0, react_1.render)(<Skeleton_1.Skeleton animation="wave"/>);
        (0, vitest_1.expect)(container.querySelector('[role="status"]')).toHaveClass('animate-shimmer');
    });
    (0, vitest_1.it)('applies no animation', () => {
        const { container } = (0, react_1.render)(<Skeleton_1.Skeleton animation="none"/>);
        const skeleton = container.querySelector('[role="status"]');
        (0, vitest_1.expect)(skeleton).not.toHaveClass('animate-pulse');
        (0, vitest_1.expect)(skeleton).not.toHaveClass('animate-shimmer');
    });
    (0, vitest_1.it)('applies custom width and height', () => {
        const { container } = (0, react_1.render)(<Skeleton_1.Skeleton width={100} height={50}/>);
        const skeleton = container.querySelector('[role="status"]');
        (0, vitest_1.expect)(skeleton.style.width).toBe('100px');
        (0, vitest_1.expect)(skeleton.style.height).toBe('50px');
    });
    (0, vitest_1.it)('applies string width and height', () => {
        const { container } = (0, react_1.render)(<Skeleton_1.Skeleton width="100%" height="10rem"/>);
        const skeleton = container.querySelector('[role="status"]');
        (0, vitest_1.expect)(skeleton.style.width).toBe('100%');
        (0, vitest_1.expect)(skeleton.style.height).toBe('10rem');
    });
    (0, vitest_1.it)('hides skeleton when show is false', () => {
        (0, react_1.render)(<Skeleton_1.Skeleton show={false}/>);
        (0, vitest_1.expect)(react_1.screen.queryByRole('status')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('shows skeleton when show is true', () => {
        (0, react_1.render)(<Skeleton_1.Skeleton show={true}/>);
        (0, vitest_1.expect)(react_1.screen.getByRole('status')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<Skeleton_1.Skeleton className="custom-class"/>);
        (0, vitest_1.expect)(container.querySelector('[role="status"]')).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = vitest_1.vi.fn();
        (0, react_1.render)(<Skeleton_1.Skeleton ref={ref}/>);
        (0, vitest_1.expect)(ref).toHaveBeenCalled();
    });
    (0, vitest_1.it)('passes through additional props', () => {
        (0, react_1.render)(<Skeleton_1.Skeleton data-testid="custom-skeleton"/>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('custom-skeleton')).toBeInTheDocument();
    });
});
(0, vitest_1.describe)('SkeletonAvatar', () => {
    (0, vitest_1.it)('renders circular skeleton with default dimensions', () => {
        const { container } = (0, react_1.render)(<Skeleton_1.SkeletonAvatar />);
        const skeleton = container.querySelector('[role="status"]');
        (0, vitest_1.expect)(skeleton).toHaveClass('rounded-full');
        (0, vitest_1.expect)(skeleton.style.width).toBe('40px');
        (0, vitest_1.expect)(skeleton.style.height).toBe('40px');
    });
});
(0, vitest_1.describe)('SkeletonText', () => {
    (0, vitest_1.it)('renders text variant skeleton', () => {
        const { container } = (0, react_1.render)(<Skeleton_1.SkeletonText />);
        (0, vitest_1.expect)(container.querySelector('[role="status"]')).toHaveClass('h-4', 'w-full', 'rounded');
    });
});
(0, vitest_1.describe)('SkeletonCard', () => {
    (0, vitest_1.it)('renders rectangular skeleton with default height', () => {
        const { container } = (0, react_1.render)(<Skeleton_1.SkeletonCard />);
        const skeleton = container.querySelector('[role="status"]');
        (0, vitest_1.expect)(skeleton).toHaveClass('h-48', 'w-full', 'rounded-md');
    });
});
//# sourceMappingURL=Skeleton.test.jsx.map