"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const FormField_1 = require("./FormField");
const Input_1 = require("../Input");
(0, vitest_1.describe)('FormField', () => {
    (0, vitest_1.it)('renders with label and input', () => {
        (0, react_1.render)(<FormField_1.FormField label="Email" htmlFor="email">
        <Input_1.Input id="email"/>
      </FormField_1.FormField>);
        (0, vitest_1.expect)(react_1.screen.getByText('Email')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByRole('textbox')).toBeInTheDocument();
    });
    (0, vitest_1.it)('renders without label', () => {
        (0, react_1.render)(<FormField_1.FormField>
        <Input_1.Input />
      </FormField_1.FormField>);
        (0, vitest_1.expect)(react_1.screen.getByRole('textbox')).toBeInTheDocument();
    });
    (0, vitest_1.it)('displays description text', () => {
        (0, react_1.render)(<FormField_1.FormField label="Email" description="We'll never share your email">
        <Input_1.Input />
      </FormField_1.FormField>);
        (0, vitest_1.expect)(react_1.screen.getByText("We'll never share your email")).toBeInTheDocument();
    });
    (0, vitest_1.it)('displays error message', () => {
        (0, react_1.render)(<FormField_1.FormField label="Email" error="Email is required">
        <Input_1.Input />
      </FormField_1.FormField>);
        (0, vitest_1.expect)(react_1.screen.getByText('Email is required')).toBeInTheDocument();
    });
    (0, vitest_1.it)('displays success message', () => {
        (0, react_1.render)(<FormField_1.FormField label="Email" success="Email is valid">
        <Input_1.Input />
      </FormField_1.FormField>);
        (0, vitest_1.expect)(react_1.screen.getByText('Email is valid')).toBeInTheDocument();
    });
    (0, vitest_1.it)('displays info message', () => {
        (0, react_1.render)(<FormField_1.FormField label="Email" info="This field is optional">
        <Input_1.Input />
      </FormField_1.FormField>);
        (0, vitest_1.expect)(react_1.screen.getByText('This field is optional')).toBeInTheDocument();
    });
    (0, vitest_1.it)('shows required indicator on label', () => {
        const { container } = (0, react_1.render)(<FormField_1.FormField label="Email" required>
        <Input_1.Input />
      </FormField_1.FormField>);
        const label = container.querySelector('label');
        (0, vitest_1.expect)(label).toHaveClass("after:content-['*']");
    });
    (0, vitest_1.it)('shows optional indicator on label', () => {
        const { container } = (0, react_1.render)(<FormField_1.FormField label="Phone" optional>
        <Input_1.Input />
      </FormField_1.FormField>);
        const label = container.querySelector('label');
        (0, vitest_1.expect)(label).toHaveClass("after:content-['(optional)']");
    });
    (0, vitest_1.it)('connects label to input with htmlFor', () => {
        const { container } = (0, react_1.render)(<FormField_1.FormField label="Email" htmlFor="email-input">
        <Input_1.Input id="email-input"/>
      </FormField_1.FormField>);
        const label = container.querySelector('label');
        (0, vitest_1.expect)(label).toHaveAttribute('for', 'email-input');
    });
    (0, vitest_1.it)('prioritizes error over success message', () => {
        (0, react_1.render)(<FormField_1.FormField label="Email" error="Email is invalid" success="Email is valid">
        <Input_1.Input />
      </FormField_1.FormField>);
        (0, vitest_1.expect)(react_1.screen.getByText('Email is invalid')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.queryByText('Email is valid')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('prioritizes error over info message', () => {
        (0, react_1.render)(<FormField_1.FormField label="Email" error="Email is invalid" info="Optional field">
        <Input_1.Input />
      </FormField_1.FormField>);
        (0, vitest_1.expect)(react_1.screen.getByText('Email is invalid')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.queryByText('Optional field')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('prioritizes success over info message', () => {
        (0, react_1.render)(<FormField_1.FormField label="Email" success="Email is valid" info="Optional field">
        <Input_1.Input />
      </FormField_1.FormField>);
        (0, vitest_1.expect)(react_1.screen.getByText('Email is valid')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.queryByText('Optional field')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('hides description when error is shown', () => {
        (0, react_1.render)(<FormField_1.FormField label="Email" description="Enter your email" error="Email is required">
        <Input_1.Input />
      </FormField_1.FormField>);
        (0, vitest_1.expect)(react_1.screen.getByText('Email is required')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.queryByText('Enter your email')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('renders in vertical orientation by default', () => {
        const { container } = (0, react_1.render)(<FormField_1.FormField label="Email">
        <Input_1.Input />
      </FormField_1.FormField>);
        const wrapper = container.firstChild;
        (0, vitest_1.expect)(wrapper).toHaveClass('space-y-2');
        (0, vitest_1.expect)(wrapper).not.toHaveClass('flex');
    });
    (0, vitest_1.it)('renders in horizontal orientation', () => {
        const { container } = (0, react_1.render)(<FormField_1.FormField label="Email" orientation="horizontal">
        <Input_1.Input />
      </FormField_1.FormField>);
        const wrapper = container.firstChild;
        (0, vitest_1.expect)(wrapper).toHaveClass('flex');
        (0, vitest_1.expect)(wrapper).toHaveClass('items-start');
    });
    (0, vitest_1.it)('applies custom className', () => {
        const { container } = (0, react_1.render)(<FormField_1.FormField className="custom-class" label="Email">
        <Input_1.Input />
      </FormField_1.FormField>);
        const wrapper = container.firstChild;
        (0, vitest_1.expect)(wrapper).toHaveClass('custom-class');
    });
    (0, vitest_1.it)('forwards ref correctly', () => {
        const ref = React.createRef();
        (0, react_1.render)(<FormField_1.FormField ref={ref} label="Email">
        <Input_1.Input />
      </FormField_1.FormField>);
        (0, vitest_1.expect)(ref.current).toBeInstanceOf(HTMLDivElement);
    });
    (0, vitest_1.it)('renders with multiple children', () => {
        (0, react_1.render)(<FormField_1.FormField label="Name">
        <Input_1.Input placeholder="First name"/>
        <Input_1.Input placeholder="Last name"/>
      </FormField_1.FormField>);
        (0, vitest_1.expect)(react_1.screen.getByPlaceholderText('First name')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByPlaceholderText('Last name')).toBeInTheDocument();
    });
});
//# sourceMappingURL=FormField.test.jsx.map