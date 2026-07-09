//
//  DesignKitReexport.swift
//  Patina
//
//  R27 Wave 0: the design tokens + portable components moved to the shared
//  local package `apps/mobile/PatinaDesignKit` (consumed by both iOS apps).
//  Re-exporting the module here keeps every existing call site compiling
//  without adding `import PatinaDesignKit` to hundreds of files.
//

@_exported import PatinaDesignKit
