"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const user_event_1 = __importDefault(require("@testing-library/user-event"));
const vitest_axe_1 = require("vitest-axe");
const Accordion_1 = require("./Accordion");
describe('Accordion', () => {
    const AccordionExample = () => (<Accordion_1.Accordion type="single" collapsible>
      <Accordion_1.AccordionItem value="item-1">
        <Accordion_1.AccordionTrigger>Section 1</Accordion_1.AccordionTrigger>
        <Accordion_1.AccordionContent>Content 1</Accordion_1.AccordionContent>
      </Accordion_1.AccordionItem>
      <Accordion_1.AccordionItem value="item-2">
        <Accordion_1.AccordionTrigger>Section 2</Accordion_1.AccordionTrigger>
        <Accordion_1.AccordionContent>Content 2</Accordion_1.AccordionContent>
      </Accordion_1.AccordionItem>
    </Accordion_1.Accordion>);
    it('renders accordion items', () => {
        (0, react_1.render)(<AccordionExample />);
        expect(react_1.screen.getByText('Section 1')).toBeInTheDocument();
        expect(react_1.screen.getByText('Section 2')).toBeInTheDocument();
    });
    it('expands and collapses on click', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<AccordionExample />);
        const trigger = react_1.screen.getByText('Section 1');
        await user.click(trigger);
        expect(react_1.screen.getByText('Content 1')).toBeVisible();
    });
    it('supports multiple type', async () => {
        const user = user_event_1.default.setup();
        (0, react_1.render)(<Accordion_1.Accordion type="multiple">
        <Accordion_1.AccordionItem value="item-1">
          <Accordion_1.AccordionTrigger>Section 1</Accordion_1.AccordionTrigger>
          <Accordion_1.AccordionContent>Content 1</Accordion_1.AccordionContent>
        </Accordion_1.AccordionItem>
        <Accordion_1.AccordionItem value="item-2">
          <Accordion_1.AccordionTrigger>Section 2</Accordion_1.AccordionTrigger>
          <Accordion_1.AccordionContent>Content 2</Accordion_1.AccordionContent>
        </Accordion_1.AccordionItem>
      </Accordion_1.Accordion>);
        await user.click(react_1.screen.getByText('Section 1'));
        await user.click(react_1.screen.getByText('Section 2'));
        expect(react_1.screen.getByText('Content 1')).toBeVisible();
        expect(react_1.screen.getByText('Content 2')).toBeVisible();
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<AccordionExample />);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=Accordion.test.jsx.map