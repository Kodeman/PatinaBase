"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const Navbar_1 = require("./Navbar");
(0, vitest_1.describe)('Navbar', () => {
    (0, vitest_1.it)('renders correctly', () => {
        (0, react_1.render)(<Navbar_1.Navbar logo={<div>Logo</div>}>
        <Navbar_1.NavbarContent>
          <Navbar_1.NavbarLink href="/home">Home</Navbar_1.NavbarLink>
        </Navbar_1.NavbarContent>
      </Navbar_1.Navbar>);
        (0, vitest_1.expect)(react_1.screen.getByText('Logo')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Home')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders with sticky variant', () => {
        const { container } = (0, react_1.render)(<Navbar_1.Navbar sticky/>);
        const nav = container.querySelector('nav');
        (0, vitest_1.expect)(nav).toHaveClass('sticky');
    });
    (0, vitest_1.it)('renders NavbarLink with active state', () => {
        (0, react_1.render)(<Navbar_1.NavbarLink href="/home" active>Home</Navbar_1.NavbarLink>);
        const link = react_1.screen.getByText('Home');
        (0, vitest_1.expect)(link).toHaveClass('text-foreground');
    });
    (0, vitest_1.it)('renders NavbarActions', () => {
        (0, react_1.render)(<Navbar_1.Navbar>
        <Navbar_1.NavbarActions>
          <button>Sign In</button>
        </Navbar_1.NavbarActions>
      </Navbar_1.Navbar>);
        (0, vitest_1.expect)(react_1.screen.getByText('Sign In')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Navbar.test.jsx.map