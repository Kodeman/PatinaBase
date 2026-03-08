"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Avatar_1 = require("../Avatar");
const AvatarGroup_1 = require("./AvatarGroup");
describe('AvatarGroup', () => {
    it('renders all avatars when below max', async () => {
        (0, react_1.render)(<AvatarGroup_1.AvatarGroup max={5}>
        <Avatar_1.Avatar name="John Doe" fallbackDelay={0}/>
        <Avatar_1.Avatar name="Jane Smith" fallbackDelay={0}/>
        <Avatar_1.Avatar name="Bob Johnson" fallbackDelay={0}/>
      </AvatarGroup_1.AvatarGroup>);
        // Wait for avatars to render
        expect(await react_1.screen.findByText('JD')).toBeInTheDocument();
        expect(await react_1.screen.findByText('JS')).toBeInTheDocument();
        expect(await react_1.screen.findByText('BJ')).toBeInTheDocument();
    });
    it('limits avatars to max and shows overflow count', async () => {
        (0, react_1.render)(<AvatarGroup_1.AvatarGroup max={2}>
        <Avatar_1.Avatar name="John Doe" fallbackDelay={0}/>
        <Avatar_1.Avatar name="Jane Smith" fallbackDelay={0}/>
        <Avatar_1.Avatar name="Bob Johnson" fallbackDelay={0}/>
        <Avatar_1.Avatar name="Alice Williams" fallbackDelay={0}/>
      </AvatarGroup_1.AvatarGroup>);
        expect(await react_1.screen.findByText('JD')).toBeInTheDocument();
        expect(await react_1.screen.findByText('JS')).toBeInTheDocument();
        expect(await react_1.screen.findByText('+2')).toBeInTheDocument();
        expect(react_1.screen.queryByText('BJ')).not.toBeInTheDocument();
    });
    it('does not show overflow when all avatars fit', async () => {
        (0, react_1.render)(<AvatarGroup_1.AvatarGroup max={3}>
        <Avatar_1.Avatar name="John Doe" fallbackDelay={0}/>
        <Avatar_1.Avatar name="Jane Smith" fallbackDelay={0}/>
      </AvatarGroup_1.AvatarGroup>);
        expect(await react_1.screen.findByText('JD')).toBeInTheDocument();
        expect(react_1.screen.queryByText(/^\+/)).not.toBeInTheDocument();
    });
    it('applies spacing correctly', () => {
        const { container, rerender } = (0, react_1.render)(<AvatarGroup_1.AvatarGroup spacing="tight">
        <Avatar_1.Avatar name="John"/>
        <Avatar_1.Avatar name="Jane"/>
      </AvatarGroup_1.AvatarGroup>);
        expect(container.firstChild).toHaveClass('-space-x-1');
        rerender(<AvatarGroup_1.AvatarGroup spacing="normal">
        <Avatar_1.Avatar name="John"/>
        <Avatar_1.Avatar name="Jane"/>
      </AvatarGroup_1.AvatarGroup>);
        expect(container.firstChild).toHaveClass('-space-x-2');
        rerender(<AvatarGroup_1.AvatarGroup spacing="loose">
        <Avatar_1.Avatar name="John"/>
        <Avatar_1.Avatar name="Jane"/>
      </AvatarGroup_1.AvatarGroup>);
        expect(container.firstChild).toHaveClass('-space-x-3');
    });
    it('passes size to all avatars', async () => {
        const { container } = (0, react_1.render)(<AvatarGroup_1.AvatarGroup size="lg">
        <Avatar_1.Avatar name="John Doe" fallbackDelay={0}/>
        <Avatar_1.Avatar name="Jane Smith" fallbackDelay={0}/>
      </AvatarGroup_1.AvatarGroup>);
        const avatars = container.querySelectorAll('[class*="h-12"]');
        expect(avatars.length).toBeGreaterThanOrEqual(2);
    });
    it('passes shape to all avatars', () => {
        const { container } = (0, react_1.render)(<AvatarGroup_1.AvatarGroup shape="square">
        <Avatar_1.Avatar name="John"/>
        <Avatar_1.Avatar name="Jane"/>
      </AvatarGroup_1.AvatarGroup>);
        const avatars = container.querySelectorAll('[class*="rounded-md"]');
        expect(avatars.length).toBeGreaterThanOrEqual(2);
    });
    it('applies custom className', () => {
        const { container } = (0, react_1.render)(<AvatarGroup_1.AvatarGroup className="custom-class">
        <Avatar_1.Avatar name="John"/>
      </AvatarGroup_1.AvatarGroup>);
        expect(container.firstChild).toHaveClass('custom-class');
    });
    it('handles single avatar', async () => {
        (0, react_1.render)(<AvatarGroup_1.AvatarGroup>
        <Avatar_1.Avatar name="John Doe" fallbackDelay={0}/>
      </AvatarGroup_1.AvatarGroup>);
        expect(await react_1.screen.findByText('JD')).toBeInTheDocument();
        expect(react_1.screen.queryByText(/^\+/)).not.toBeInTheDocument();
    });
    it('shows correct overflow count for many avatars', async () => {
        const avatars = Array.from({ length: 10 }, (_, i) => (<Avatar_1.Avatar key={i} name={`User ${i}`} fallbackDelay={0}/>));
        (0, react_1.render)(<AvatarGroup_1.AvatarGroup max={3}>{avatars}</AvatarGroup_1.AvatarGroup>);
        expect(await react_1.screen.findByText('+7')).toBeInTheDocument();
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<AvatarGroup_1.AvatarGroup max={3}>
        <Avatar_1.Avatar name="John Doe"/>
        <Avatar_1.Avatar name="Jane Smith"/>
        <Avatar_1.Avatar name="Bob Johnson"/>
        <Avatar_1.Avatar name="Alice Williams"/>
      </AvatarGroup_1.AvatarGroup>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=AvatarGroup.test.jsx.map