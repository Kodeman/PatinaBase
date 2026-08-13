import { requestLibraryCapture, subscribeToLibraryCapture } from "./library-capture-events";

it("connects the Paste URL request to the Library capture consumer", () => {
  const open = jest.fn();
  const unsubscribe = subscribeToLibraryCapture(open);
  requestLibraryCapture();
  expect(open).toHaveBeenCalledTimes(1);
  unsubscribe();
  requestLibraryCapture();
  expect(open).toHaveBeenCalledTimes(1);
});
