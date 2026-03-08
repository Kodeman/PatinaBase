"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const AspectRatio_1 = require("./AspectRatio");
describe('AspectRatio', () => {
    it('renders children correctly', () => {
        (0, react_1.render)(<AspectRatio_1.AspectRatio>
        <div>Content</div>
      </AspectRatio_1.AspectRatio>);
        expect(react_1.screen.getByText('Content')).toBeInTheDocument();
    });
    it('renders as div by default', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio>Content</AspectRatio_1.AspectRatio>);
        expect(container.firstChild?.nodeName).toBe('DIV');
    });
    it('renders as different element when "as" prop is provided', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio as="section">Content</AspectRatio_1.AspectRatio>);
        expect(container.firstChild?.nodeName).toBe('SECTION');
    });
    it('applies relative and full width classes', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio>Content</AspectRatio_1.AspectRatio>);
        expect(container.firstChild).toHaveClass('relative', 'w-full');
    });
    it('applies default 16:9 aspect ratio', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio>Content</AspectRatio_1.AspectRatio>);
        const element = container.firstChild;
        // 16:9 = 56.25%
        expect(element.style.paddingBottom).toBe('56.25%');
    });
    it('applies custom aspect ratio', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio ratio={4 / 3}>Content</AspectRatio_1.AspectRatio>);
        const element = container.firstChild;
        // 4:3 = 75%
        expect(element.style.paddingBottom).toBe('75%');
    });
    it('applies 1:1 aspect ratio correctly', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio ratio={1}>Content</AspectRatio_1.AspectRatio>);
        const element = container.firstChild;
        // 1:1 = 100%
        expect(element.style.paddingBottom).toBe('100%');
    });
    it('applies 21:9 aspect ratio correctly', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio ratio={21 / 9}>Content</AspectRatio_1.AspectRatio>);
        const element = container.firstChild;
        // 21:9 ≈ 42.857%
        expect(parseFloat(element.style.paddingBottom)).toBeCloseTo(42.857, 2);
    });
    it('wraps children in absolute positioned div', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio>
        <img src="test.jpg" alt="Test"/>
      </AspectRatio_1.AspectRatio>);
        const innerDiv = container.querySelector('.absolute.inset-0');
        expect(innerDiv).toBeInTheDocument();
        expect(innerDiv?.querySelector('img')).toBeInTheDocument();
    });
    it('applies custom className', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio className="custom-class">Content</AspectRatio_1.AspectRatio>);
        expect(container.firstChild).toHaveClass('custom-class');
        expect(container.firstChild).toHaveClass('relative', 'w-full');
    });
    it('forwards ref correctly', () => {
        const ref = { current: null };
        (0, react_1.render)(<AspectRatio_1.AspectRatio ref={ref}>Content</AspectRatio_1.AspectRatio>);
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
    it('supports HTML attributes', () => {
        (0, react_1.render)(<AspectRatio_1.AspectRatio data-testid="test-ratio" aria-label="Video container">
        Content
      </AspectRatio_1.AspectRatio>);
        const ratio = react_1.screen.getByTestId('test-ratio');
        expect(ratio).toHaveAttribute('aria-label', 'Video container');
    });
    it('merges custom styles with component styles', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio ratio={16 / 9} style={{ backgroundColor: 'red' }}>
        Content
      </AspectRatio_1.AspectRatio>);
        const element = container.firstChild;
        expect(element.style.paddingBottom).toBe('56.25%');
        expect(element.style.backgroundColor).toBe('red');
    });
    it('works with image children', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio ratio={16 / 9}>
        <img src="test.jpg" alt="Test" className="object-cover"/>
      </AspectRatio_1.AspectRatio>);
        const img = container.querySelector('img');
        expect(img).toHaveAttribute('src', 'test.jpg');
        expect(img).toHaveClass('object-cover');
    });
    it('works with iframe children', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio ratio={16 / 9}>
        <iframe src="https://example.com" title="Example"/>
      </AspectRatio_1.AspectRatio>);
        const iframe = container.querySelector('iframe');
        expect(iframe).toHaveAttribute('src', 'https://example.com');
    });
    it('works with video children', () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio ratio={16 / 9}>
        <video src="video.mp4" controls/>
      </AspectRatio_1.AspectRatio>);
        const video = container.querySelector('video');
        expect(video).toHaveAttribute('src', 'video.mp4');
    });
    it('maintains aspect ratio with different ratios', () => {
        const ratios = [
            { ratio: 16 / 9, expected: 56.25 },
            { ratio: 4 / 3, expected: 75 },
            { ratio: 1, expected: 100 },
            { ratio: 2, expected: 50 },
            { ratio: 3 / 2, expected: 66.666 },
        ];
        ratios.forEach(({ ratio, expected }) => {
            const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio ratio={ratio}>Content</AspectRatio_1.AspectRatio>);
            const element = container.firstChild;
            expect(parseFloat(element.style.paddingBottom)).toBeCloseTo(expected, 2);
        });
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<AspectRatio_1.AspectRatio ratio={16 / 9}>
        <img src="test.jpg" alt="Test image"/>
      </AspectRatio_1.AspectRatio>);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=AspectRatio.test.jsx.map