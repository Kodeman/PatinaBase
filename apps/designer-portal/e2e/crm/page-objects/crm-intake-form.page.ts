/**
 * CRM Intake Form Page Object
 *
 * Models the client intake form for creating new clients
 */

import { Page } from '@playwright/test';
import { BasePage } from './base.page';

export interface IntakeFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  designStyle?: string;
  budget?: string;
  projectScope?: string;
  notes?: string;
}

export class CRMIntakeFormPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Selectors
  readonly formContainer = 'form[data-testid="intake-form"]';
  readonly firstNameInput = 'input[name="firstName"]';
  readonly lastNameInput = 'input[name="lastName"]';
  readonly emailInput = 'input[name="email"]';
  readonly phoneInput = 'input[name="phone"]';
  readonly companyInput = 'input[name="company"]';
  readonly addressInput = 'input[name="address"]';
  readonly cityInput = 'input[name="city"]';
  readonly stateInput = 'input[name="state"]';
  readonly zipCodeInput = 'input[name="zipCode"]';
  readonly designStyleSelect = 'select[name="designStyle"]';
  readonly budgetInput = 'input[name="budget"]';
  readonly projectScopeInput = 'input[name="projectScope"]';
  readonly notesTextarea = 'textarea[name="notes"]';
  readonly submitButton = 'button[type="submit"][data-testid="submit-intake"]';
  readonly cancelButton = 'button[data-testid="cancel-intake"]';
  readonly clearButton = 'button[data-testid="clear-form"]';
  readonly formErrors = 'div[data-testid="form-errors"]';
  readonly successMessage = 'div[data-testid="success-message"]';
  readonly loadingSpinner = 'div[data-testid="loading"]';
  readonly requiredFieldIndicator = 'span.required-field';

  /**
   * Navigate to intake form
   */
  async navigate(): Promise<void> {
    await this.goto('/crm/intake');
  }

  /**
   * Check if form is displayed
   */
  async isFormDisplayed(): Promise<boolean> {
    return this.isVisible(this.formContainer);
  }

  /**
   * Fill the entire intake form
   */
  async fillForm(data: IntakeFormData): Promise<void> {
    await this.fill(this.firstNameInput, data.firstName);
    await this.fill(this.lastNameInput, data.lastName);
    await this.fill(this.emailInput, data.email);
    await this.fill(this.phoneInput, data.phone);

    if (data.company) {
      await this.fill(this.companyInput, data.company);
    }

    if (data.address) {
      await this.fill(this.addressInput, data.address);
    }

    if (data.city) {
      await this.fill(this.cityInput, data.city);
    }

    if (data.state) {
      await this.fill(this.stateInput, data.state);
    }

    if (data.zipCode) {
      await this.fill(this.zipCodeInput, data.zipCode);
    }

    if (data.designStyle) {
      await this.selectDropdown(this.designStyleSelect, data.designStyle);
    }

    if (data.budget) {
      await this.fill(this.budgetInput, data.budget);
    }

    if (data.projectScope) {
      await this.fill(this.projectScopeInput, data.projectScope);
    }

    if (data.notes) {
      await this.fill(this.notesTextarea, data.notes);
    }
  }

  /**
   * Submit the form
   */
  async submitForm(): Promise<void> {
    await this.click(this.submitButton);
    await this.waitForElementHidden(this.loadingSpinner);
  }

  /**
   * Clear the form
   */
  async clearForm(): Promise<void> {
    await this.click(this.clearButton);
  }

  /**
   * Cancel form submission
   */
  async cancelForm(): Promise<void> {
    await this.click(this.cancelButton);
  }

  /**
   * Check if form has validation errors
   */
  async hasValidationErrors(): Promise<boolean> {
    return this.isVisible(this.formErrors);
  }

  /**
   * Get validation error messages
   */
  async getValidationErrors(): Promise<string[]> {
    const errorElements = await this.page.$$('div[data-testid="form-error-message"]');
    const errors: string[] = [];

    for (const element of errorElements) {
      const text = await element.textContent();
      if (text) {
        errors.push(text.trim());
      }
    }

    return errors;
  }

  /**
   * Check if success message is displayed
   */
  async isSuccessMessageDisplayed(): Promise<boolean> {
    return this.isVisible(this.successMessage);
  }

  /**
   * Get success message text
   */
  async getSuccessMessage(): Promise<string | null> {
    return this.getText(this.successMessage);
  }

  /**
   * Fill only required fields
   */
  async fillRequiredFields(
    firstName: string,
    lastName: string,
    email: string,
    phone: string
  ): Promise<void> {
    await this.fill(this.firstNameInput, firstName);
    await this.fill(this.lastNameInput, lastName);
    await this.fill(this.emailInput, email);
    await this.fill(this.phoneInput, phone);
  }

  /**
   * Check if a field is required
   */
  async isFieldRequired(fieldName: keyof IntakeFormData): Promise<boolean> {
    const fieldSelectors: Record<keyof IntakeFormData, string> = {
      firstName: this.firstNameInput,
      lastName: this.lastNameInput,
      email: this.emailInput,
      phone: this.phoneInput,
      company: this.companyInput,
      address: this.addressInput,
      city: this.cityInput,
      state: this.stateInput,
      zipCode: this.zipCodeInput,
      designStyle: this.designStyleSelect,
      budget: this.budgetInput,
      projectScope: this.projectScopeInput,
      notes: this.notesTextarea,
    };

    const fieldSelector = fieldSelectors[fieldName];
    const ariaRequired = await this.getAttribute(fieldSelector, 'aria-required');
    const required = await this.getAttribute(fieldSelector, 'required');

    return ariaRequired === 'true' || required !== null;
  }

  /**
   * Get all required field labels
   */
  async getRequiredFieldLabels(): Promise<string[]> {
    return this.getAllText('label .required-field');
  }

  /**
   * Verify form structure
   */
  async verifyFormStructure(): Promise<void> {
    // Check all main sections exist
    const sections = [
      'div[data-testid="contact-section"]',
      'div[data-testid="location-section"]',
      'div[data-testid="project-section"]',
    ];

    for (const section of sections) {
      if (!(await this.isVisible(section))) {
        throw new Error(`Missing form section: ${section}`);
      }
    }
  }

  /**
   * Get form field value
   */
  async getFieldValue(fieldName: keyof IntakeFormData): Promise<string | null> {
    const fieldSelectors: Record<keyof IntakeFormData, string> = {
      firstName: this.firstNameInput,
      lastName: this.lastNameInput,
      email: this.emailInput,
      phone: this.phoneInput,
      company: this.companyInput,
      address: this.addressInput,
      city: this.cityInput,
      state: this.stateInput,
      zipCode: this.zipCodeInput,
      designStyle: this.designStyleSelect,
      budget: this.budgetInput,
      projectScope: this.projectScopeInput,
      notes: this.notesTextarea,
    };

    return this.getAttribute(fieldSelectors[fieldName], 'value');
  }

  /**
   * Check if submit button is enabled
   */
  async isSubmitButtonEnabled(): Promise<boolean> {
    return this.isEnabled(this.submitButton);
  }

  /**
   * Wait for form to be interactive
   */
  async waitForFormReady(): Promise<void> {
    await this.waitForElement(this.formContainer);
    await this.waitForElement(this.submitButton);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Test email field validation
   */
  async testEmailValidation(): Promise<void> {
    const invalidEmails = [
      'invalid-email',
      'test@',
      '@example.com',
      'test @example.com',
    ];

    for (const email of invalidEmails) {
      await this.fill(this.emailInput, email);
      await this.click(this.submitButton);

      const hasError = await this.hasValidationErrors();
      if (!hasError) {
        throw new Error(`Email validation failed for: ${email}`);
      }
    }
  }

  /**
   * Test phone field validation
   */
  async testPhoneValidation(): Promise<void> {
    const invalidPhones = ['123', '12345', 'abc-def-ghij'];

    for (const phone of invalidPhones) {
      await this.fill(this.phoneInput, phone);
      await this.click(this.submitButton);

      const hasError = await this.hasValidationErrors();
      if (!hasError) {
        throw new Error(`Phone validation failed for: ${phone}`);
      }
    }
  }

  /**
   * Verify form auto-saves progress
   */
  async verifyAutoSave(delayMs = 2000): Promise<void> {
    const testData: IntakeFormData = {
      firstName: 'Auto',
      lastName: 'Save',
      email: 'auto@example.com',
      phone: '555-0123',
    };

    await this.fillForm(testData);
    await this.page.waitForTimeout(delayMs);

    // Reload and check data persists
    await this.reload();
    const firstName = await this.getFieldValue('firstName');

    if (firstName !== testData.firstName) {
      throw new Error('Auto-save did not persist data');
    }
  }

  /**
   * Check form accessibility
   */
  async verifyFormAccessibility(): Promise<void> {
    // Verify all inputs have associated labels
    const inputs = await this.page.$$(
      'input[required], textarea[required], select[required]'
    );

    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const label = await this.page.$(`label[for="${id}"]`);

      if (!label) {
        throw new Error(`Input ${id} is missing associated label`);
      }
    }

    // Verify error messages are properly associated
    const errorMessages = await this.page.$$('div[role="alert"]');
    if (errorMessages.length > 0) {
      for (const errorMsg of errorMessages) {
        const ariaDescribedBy = await errorMsg.getAttribute('aria-describedby');
        if (!ariaDescribedBy) {
          console.warn('Error message missing aria-describedby');
        }
      }
    }
  }
}
