"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const Carousel_1 = require("./Carousel");
(0, vitest_1.describe)('Carousel', () => {
    (0, vitest_1.it)('renders carousel with slides', () => {
        (0, react_1.render)(<Carousel_1.Carousel>
        <div>Slide 1</div>
        <div>Slide 2</div>
        <div>Slide 3</div>
      </Carousel_1.Carousel>);
        (0, vitest_1.expect)(react_1.screen.getByText('Slide 1')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Slide 2')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Slide 3')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders navigation buttons', () => {
        (0, react_1.render)(<Carousel_1.Carousel showNavigation>
        <div>Slide 1</div>
        <div>Slide 2</div>
      </Carousel_1.Carousel>);
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Previous slide')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Next slide')).toBeInTheDocument();
    });
    (0, vitest_1.it)('hides navigation when disabled', () => {
        (0, react_1.render)(<Carousel_1.Carousel showNavigation={false}>
        <div>Slide 1</div>
        <div>Slide 2</div>
      </Carousel_1.Carousel>);
        (0, vitest_1.expect)(react_1.screen.queryByLabelText('Previous slide')).not.toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.queryByLabelText('Next slide')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('renders dots indicator', () => {
        (0, react_1.render)(<Carousel_1.Carousel showDots>
        <div>Slide 1</div>
        <div>Slide 2</div>
        <div>Slide 3</div>
      </Carousel_1.Carousel>);
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Go to slide 1')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Go to slide 2')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByLabelText('Go to slide 3')).toBeInTheDocument();
    });
    (0, vitest_1.it)('calls onSlideChange callback', async () => {
        const onSlideChange = vitest_1.vi.fn();
        (0, react_1.render)(<Carousel_1.Carousel onSlideChange={onSlideChange}>
        <div>Slide 1</div>
        <div>Slide 2</div>
      </Carousel_1.Carousel>);
        // Wait for initial render
        await vitest_1.vi.waitFor(() => {
            (0, vitest_1.expect)(onSlideChange).toHaveBeenCalled();
        });
    });
    (0, vitest_1.it)('renders CarouselItem', () => {
        (0, react_1.render)(<Carousel_1.Carousel>
        <Carousel_1.CarouselItem>
          <div>Content</div>
        </Carousel_1.CarouselItem>
      </Carousel_1.Carousel>);
        (0, vitest_1.expect)(react_1.screen.getByText('Content')).toBeInTheDocument();
    });
});
//# sourceMappingURL=Carousel.test.jsx.map