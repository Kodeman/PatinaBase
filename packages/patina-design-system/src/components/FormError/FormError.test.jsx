"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const FormError_1 = require("./FormError");
(0, vitest_1.describe)('FormError', () => {
    (0, vitest_1.it)('renders error message', () => {
        (0, react_1.render)(<FormError_1.FormError>This is an error</FormError_1.FormError>);
        (0, vitest_1.expect)(react_1.screen.getByText('This is an error')).toBeInTheDocument();
    });
    (0, vitest_1.it)('does not render when children is null', () => {
        const { container } = (0, react_1.render)(<FormError_1.FormError>{null}</FormError_1.FormError>);
        (0, vitest_1.expect)(container.firstChild).toBeNull();
    });
    (0, vitest_1.it)('does not render when children is undefined', () => {
        const { container } = (0, react_1.render)(<FormError_1.FormError>{undefined}</FormError_1.FormError>);
        (0, vitest_1.expect)(container.firstChild).toBeNull();
    });
    (0, vitest_1.it)('renders with error variant by default', () => {
        const { container } = (0, react_1.render)(<FormError_1.FormError>Error message</FormError_1.FormError>);
        const paragraph = container.querySelector('p');
        (0, vitest_1.expect)(paragraph).toHaveClass('text-destructive');
    });
    (0, vitest_1.it)('renders with success variant', () => {
        const { container } = (0, react_1.render)(<FormError_1.FormError variant="success">Success message</FormError_1.FormError>);
        const paragraph = container.querySelector('p');
        (0, vitest_1.expect)(paragraph).toHaveClass('text-green-600');
    });
    (0, vitest_1.it)('renders with info variant', () => {
        const { container } = (0, react_1.render)(<FormError_1.FormError variant="info">Info message</FormError_1.FormError>);
        const paragraph = container.querySelector('p');
        (0, vitest_1.expect)(paragraph).toHaveClass('text-muted-foreground');
    });
    (0, vitest_1.it)('shows icon by default', () => {
        const { container } = (0, react_1.render)(<FormError_1.FormError>Error with icon</FormError_1.FormError>);
        const icon = container.querySelector('svg');
        (0, vitest_1.expect)(icon).toBeInTheDocument();
    });
    (0, vitest_1.it)('hides icon when showIcon is false', () => {
        const { container } = (0, react_1.render)(<FormError_1.FormError showIcon={false}>Error without icon</FormError_1.FormError>);
        const icon = container.querySelector('svg');
        (0, vitest_1.expect)(icon).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('shows different icons for different variants', () => {
        const { container: errorContainer } = (0, react_1.render)(<FormError_1.FormError variant="error">Error</FormError_1.FormError>);
        const { container: successContainer } = (0, react_1.render)(<FormError_1.FormError variant="success">Success</FormError_1.FormError>);
        const { container: infoContainer } = (0, react_1.render)(<FormError_1.FormError variant="info">Info</FormError_1.FormError>);
        (0, vitest_1.expect)(errorContainer.querySelector('svg')).toBeInTheDocument();
        (0, vitest_1.expect)(successContainer.querySelector('svg')).toBeInTheDocument();
        (0, vitest_1.expect)(infoContainer.querySelector('svg')).toBeInTheDocument();
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<FormError_1.FormError className="custom-class">Error</FormError_1.FormError>);
        const paragraph = container.querySelector('p');
        (0, vitest_1.expect)(paragraph).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = React.createRef();
        (0, react_1.render)(<FormError_1.FormError ref={ref}>Error</FormError_1.FormError>);
        (0, vitest_1.expect)(ref.current).toBeInstanceOf(HTMLParagraphElement);
    });
    (0, vitest_1.it)('renders with animation classes', () => {
        const { container } = (0, react_1.render)(<FormError_1.FormError>Error</FormError_1.FormError>);
        const paragraph = container.querySelector('p');
        (0, vitest_1.expect)(paragraph).toHaveClass('animate-in');
        (0, vitest_1.expect)(paragraph).toHaveClass('fade-in-0');
        (0, vitest_1.expect)(paragraph).toHaveClass('slide-in-from-top-1');
    });
    (0, vitest_1.it)('forwards additional props', () => {
        (0, react_1.render)(<FormError_1.FormError data-testid="error-message">Error</FormError_1.FormError>);
        (0, vitest_1.expect)(react_1.screen.getByTestId('error-message')).toBeInTheDocument();
    });
    (0, vitest_1.it)('sets aria-hidden on icon', () => {
        const { container } = (0, react_1.render)(<FormError_1.FormError>Error</FormError_1.FormError>);
        const icon = container.querySelector('svg');
        (0, vitest_1.expect)(icon).toHaveAttribute('aria-hidden', 'true');
    });
    (0, vitest_1.it)('handles long error messages', () => {
        const longMessage = 'This is a very long error message that should wrap correctly and maintain proper spacing with the icon';
        (0, react_1.render)(<FormError_1.FormError>{longMessage}</FormError_1.FormError>);
        (0, vitest_1.expect)(react_1.screen.getByText(longMessage)).toBeInTheDocument();
    });
});
//# sourceMappingURL=FormError.test.jsx.map