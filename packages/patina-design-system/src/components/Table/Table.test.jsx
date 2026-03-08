"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("@testing-library/react");
const vitest_axe_1 = require("vitest-axe");
const Table_1 = require("./Table");
describe('Table', () => {
    const TableExample = () => (<Table_1.Table>
      <Table_1.TableCaption>Test table</Table_1.TableCaption>
      <Table_1.TableHeader>
        <Table_1.TableRow>
          <Table_1.TableHead>Name</Table_1.TableHead>
          <Table_1.TableHead>Email</Table_1.TableHead>
        </Table_1.TableRow>
      </Table_1.TableHeader>
      <Table_1.TableBody>
        <Table_1.TableRow>
          <Table_1.TableCell>John Doe</Table_1.TableCell>
          <Table_1.TableCell>john@example.com</Table_1.TableCell>
        </Table_1.TableRow>
        <Table_1.TableRow>
          <Table_1.TableCell>Jane Smith</Table_1.TableCell>
          <Table_1.TableCell>jane@example.com</Table_1.TableCell>
        </Table_1.TableRow>
      </Table_1.TableBody>
    </Table_1.Table>);
    it('renders table correctly', () => {
        const { container } = (0, react_1.render)(<TableExample />);
        expect(container.querySelector('table')).toBeInTheDocument();
    });
    it('renders table headers', () => {
        (0, react_1.render)(<TableExample />);
        expect(react_1.screen.getByText('Name')).toBeInTheDocument();
        expect(react_1.screen.getByText('Email')).toBeInTheDocument();
    });
    it('renders table data', () => {
        (0, react_1.render)(<TableExample />);
        expect(react_1.screen.getByText('John Doe')).toBeInTheDocument();
        expect(react_1.screen.getByText('john@example.com')).toBeInTheDocument();
    });
    it('renders caption', () => {
        (0, react_1.render)(<TableExample />);
        expect(react_1.screen.getByText('Test table')).toBeInTheDocument();
    });
    it('applies sticky header when specified', () => {
        (0, react_1.render)(<Table_1.Table>
        <Table_1.TableHeader>
          <Table_1.TableRow>
            <Table_1.TableHead sticky>Sticky Header</Table_1.TableHead>
          </Table_1.TableRow>
        </Table_1.TableHeader>
      </Table_1.Table>);
        expect(react_1.screen.getByText('Sticky Header')).toHaveClass('sticky');
    });
    it('has no accessibility violations', async () => {
        const { container } = (0, react_1.render)(<TableExample />);
        expect(await (0, vitest_axe_1.axe)(container)).toHaveNoViolations();
    });
});
//# sourceMappingURL=Table.test.jsx.map