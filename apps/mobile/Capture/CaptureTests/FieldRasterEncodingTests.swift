//  FieldRasterEncodingTests.swift
//  CaptureTests
//
//  Simulator-level contract tests for the shared production Field raster encoder
//  and its DEBUG-only physical-device evidence fixture.

#if DEBUG

import CoreGraphics
import Foundation
import ImageIO
import Testing
@testable import CaptureKit

struct FieldRasterEncodingTests {
    @Test func fixtureExportsDimensionsIntrinsicsMarkersAndHashes() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }

        let output = try FieldRasterFixtureExporter.export(to: directory)
        let manifestData = try Data(contentsOf: output.manifestURL)
        let manifest = try JSONDecoder().decode(
            FieldRasterFixtureExporter.Manifest.self,
            from: manifestData
        )

        #expect(manifest == output.manifest)
        #expect(manifest.fixtureID == "field-core-image-raster-v1")
        #expect(manifest.nativeRaster.width == 640)
        #expect(manifest.nativeRaster.height == 360)
        #expect(manifest.nativeRaster.rowBytes == 2_560)
        #expect(manifest.encodedRaster.width == 360)
        #expect(manifest.encodedRaster.height == 640)
        #expect(manifest.nativeIntrinsics == .init(
            fx: 512.5,
            fy: 509.25,
            cx: 301.25,
            cy: 154.75,
            imageWidth: 640,
            imageHeight: 360
        ))
        #expect(manifest.expectedEncodedIntrinsics == .init(
            fx: 509.25,
            fy: 512.5,
            cx: 205.25,
            cy: 301.25,
            imageWidth: 360,
            imageHeight: 640
        ))
        #expect(manifest.markers.count == 6)
        #expect(manifest.markers.filter { $0.role == "corner" }.count == 4)
        #expect(manifest.markers.filter { $0.role == "off-centre-fiducial" }.count == 2)

        let nativeData = try Data(contentsOf: output.nativeRasterURL)
        let heicData = try Data(contentsOf: output.heicURL)
        #expect(FieldRasterEncoder.heicQuality == 0.75)
        #expect(manifest.nativeRaster.sha256
                == "6e9dea45e81d4905a912e8921221fa82b074b834f8efe76cc419ae3e82176690")
        #expect(manifest.nativeRaster.sha256 == BundleChecksum.sha256(of: nativeData))
        #expect(manifest.encodedRaster.sha256 == BundleChecksum.sha256(of: heicData))
        #expect(output.manifestSHA256 == BundleChecksum.sha256(of: manifestData))
    }

    @Test func productionPipelinePhysicallyRotatesEveryAsymmetricMarkerClockwise() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let output = try FieldRasterFixtureExporter.export(to: directory)
        let image = try #require(decodedImage(at: output.heicURL))
        #expect(image.width == output.manifest.encodedRaster.width)
        #expect(image.height == output.manifest.encodedRaster.height)

        let rgba = try normalizedRGBA(image)
        for marker in output.manifest.markers {
            let actual = averageColor(
                rgba,
                width: image.width,
                height: image.height,
                around: marker.expectedEncodedCoordinate,
                radius: 2
            )
            let expected = try rgbaBytes(marker.rgbaHex)
            #expect(abs(Int(actual.r) - Int(expected.r)) <= 48, "red mismatch for \(marker.id)")
            #expect(abs(Int(actual.g) - Int(expected.g)) <= 48, "green mismatch for \(marker.id)")
            #expect(abs(Int(actual.b) - Int(expected.b)) <= 48, "blue mismatch for \(marker.id)")
        }
    }

    @Test func fixtureDefinitionAndEncodingAreRepeatableWithinOneRuntime() throws {
        let firstDirectory = try temporaryDirectory()
        let secondDirectory = try temporaryDirectory()
        defer {
            try? FileManager.default.removeItem(at: firstDirectory)
            try? FileManager.default.removeItem(at: secondDirectory)
        }

        let first = try FieldRasterFixtureExporter.export(to: firstDirectory)
        let second = try FieldRasterFixtureExporter.export(to: secondDirectory)
        #expect(first.manifest == second.manifest)
        #expect(try Data(contentsOf: first.nativeRasterURL) == Data(contentsOf: second.nativeRasterURL))
        #expect(try Data(contentsOf: first.heicURL) == Data(contentsOf: second.heicURL))
        #expect(try Data(contentsOf: first.manifestURL) == Data(contentsOf: second.manifestURL))
    }

    @Test func productionImageIOHEICHasOneAssociatedIdentityRotation() throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }

        let output = try FieldRasterFixtureExporter.export(to: directory)
        let heicData = try Data(contentsOf: output.heicURL)

        try HEIFIdentityRotationContract.validate(heicData)
    }

    @Test func identityRotationContractRejectsZeroAssociatedTransforms() {
        let heic = SyntheticHEIF.make(
            properties: [.init(type: "ispe", payload: Data(repeating: 0, count: 12))],
            associations: [.init(itemID: 1, propertyIndices: [1])]
        )

        expectViolation(.associatedTransformCount(0), in: heic)
    }

    @Test func identityRotationContractRejectsEveryNonidentityRotation() {
        for angle in UInt8(1) ... UInt8(3) {
            let heic = SyntheticHEIF.make(
                properties: [.rotation(angle)],
                associations: [.init(itemID: 1, propertyIndices: [1])]
            )

            expectViolation(.nonidentityRotation(angle), in: heic)
        }
    }

    @Test func identityRotationContractRejectsMirrorAndCleanAperture() {
        let mirror = SyntheticHEIF.make(
            properties: [.mirror(axis: 0)],
            associations: [.init(itemID: 1, propertyIndices: [1])]
        )
        expectViolation(.unexpectedTransform("imir"), in: mirror)

        let cleanAperture = SyntheticHEIF.make(
            properties: [.cleanAperture],
            associations: [.init(itemID: 1, propertyIndices: [1])]
        )
        expectViolation(.unexpectedTransform("clap"), in: cleanAperture)
    }

    @Test func identityRotationContractRejectsDuplicateAndCancelingRotations() {
        let duplicate = SyntheticHEIF.make(
            properties: [.rotation(0), .rotation(0)],
            associations: [.init(itemID: 1, propertyIndices: [1, 2])]
        )
        expectViolation(.associatedTransformCount(2), in: duplicate)

        let canceling = SyntheticHEIF.make(
            properties: [.rotation(1), .rotation(3)],
            associations: [.init(itemID: 1, propertyIndices: [1, 2])]
        )
        expectViolation(.associatedTransformCount(2), in: canceling)
    }

    @Test func identityRotationContractRejectsNonessentialIdentityRotation() {
        let heic = SyntheticHEIF.make(
            properties: [.rotation(0)],
            associations: [
                .init(itemID: 1, propertyIndices: [1], essential: false)
            ]
        )

        expectViolation(.nonessentialTransform("irot"), in: heic)
    }

    @Test func identityRotationContractAcceptsEssential15BitAssociationIndex() throws {
        var properties = Array(
            repeating: SyntheticHEIF.Property(
                type: "ispe",
                payload: Data(repeating: 0, count: 12)
            ),
            count: 127
        )
        properties.append(.rotation(0))
        let heic = SyntheticHEIF.make(
            properties: properties,
            associations: [.init(itemID: 1, propertyIndices: [128])]
        )

        try HEIFIdentityRotationContract.validate(heic)
    }

    @Test func identityRotationContractRejectsInvalidRotationPayloads() {
        let emptyPayload = SyntheticHEIF.make(
            properties: [.init(type: "irot", payload: Data())],
            associations: [.init(itemID: 1, propertyIndices: [1])]
        )
        expectViolation(
            .invalidTransformPayload(type: "irot", actual: 0, expected: 1),
            in: emptyPayload
        )

        let longPayload = SyntheticHEIF.make(
            properties: [.init(type: "irot", payload: Data([0, 0]))],
            associations: [.init(itemID: 1, propertyIndices: [1])]
        )
        expectViolation(
            .invalidTransformPayload(type: "irot", actual: 2, expected: 1),
            in: longPayload
        )

        let reservedBits = SyntheticHEIF.make(
            properties: [.init(type: "irot", payload: Data([0b0000_0100]))],
            associations: [.init(itemID: 1, propertyIndices: [1])]
        )
        expectViolation(.nonzeroReservedBits(type: "irot", byte: 4), in: reservedBits)
    }

    @Test func identityRotationContractRejectsMalformedAndInvalidAssociations() {
        let malformedBox = Data([0, 0, 0, 7]) + Data("meta".utf8)
        expectViolation(.invalidBoxSize(type: "meta", size: 7), in: malformedBox)

        var truncated = SyntheticHEIF.make(
            properties: [.rotation(0)],
            associations: [.init(itemID: 1, propertyIndices: [1])]
        )
        truncated.removeLast()
        expectViolation(.boxExtendsPastParent("meta"), in: truncated)

        let zeroIndex = SyntheticHEIF.make(
            properties: [.rotation(0)],
            associations: [.init(itemID: 1, propertyIndices: [0])]
        )
        expectViolation(
            .invalidPropertyIndex(index: 0, propertyCount: 1),
            in: zeroIndex
        )

        let outOfRange = SyntheticHEIF.make(
            properties: [.rotation(0)],
            associations: [.init(itemID: 1, propertyIndices: [2])]
        )
        expectViolation(
            .invalidPropertyIndex(index: 2, propertyCount: 1),
            in: outOfRange
        )
    }

    @Test func identityRotationContractUsesPitmAndIgnoresUnassociatedTransforms() throws {
        let heic = SyntheticHEIF.make(
            primaryItemID: 2,
            properties: [
                .rotation(3),
                .mirror(axis: 0),
                .cleanAperture,
                .rotation(0)
            ],
            associations: [
                .init(itemID: 1, propertyIndices: [1, 2, 3]),
                .init(itemID: 2, propertyIndices: [4])
            ]
        )

        try HEIFIdentityRotationContract.validate(heic)
    }

    private func expectViolation(
        _ expected: HEIFIdentityRotationContract.Violation,
        in data: Data
    ) {
        do {
            try HEIFIdentityRotationContract.validate(data)
            Issue.record("expected \(expected), but HEIF validation succeeded")
        } catch let actual as HEIFIdentityRotationContract.Violation {
            #expect(actual == expected)
        } catch {
            Issue.record("expected \(expected), but received \(error)")
        }
    }
}

private enum HEIFIdentityRotationContract {
    enum Violation: Error, Equatable {
        case missingBox(String)
        case duplicateBox(String)
        case truncated(String)
        case invalidBoxSize(type: String, size: UInt64)
        case boxExtendsPastParent(String)
        case invalidFourCC
        case unsupportedVersion(type: String, version: UInt8)
        case unsupportedFlags(type: String, flags: UInt32)
        case invalidPropertyIndex(index: Int, propertyCount: Int)
        case invalidTransformPayload(type: String, actual: Int, expected: Int)
        case nonzeroReservedBits(type: String, byte: UInt8)
        case associatedTransformCount(Int)
        case nonidentityRotation(UInt8)
        case nonessentialTransform(String)
        case unexpectedTransform(String)
    }

    private enum Transform: Equatable {
        case rotation(UInt8)
        case mirror(UInt8)
        case cleanAperture

        var type: String {
            switch self {
            case .rotation: "irot"
            case .mirror: "imir"
            case .cleanAperture: "clap"
            }
        }
    }

    private struct AssociatedTransform {
        let value: Transform
        let essential: Bool
    }

    private struct PropertyAssociation {
        let propertyIndex: Int
        let essential: Bool
    }

    private struct Box {
        let type: String
        let payloadRange: Range<Int>
    }

    private struct FullBox {
        let version: UInt8
        let flags: UInt32
        let contentRange: Range<Int>
    }

    private struct Cursor {
        let bytes: [UInt8]
        let endIndex: Int
        var index: Int
        let context: String

        init(bytes: [UInt8], range: Range<Int>, context: String) {
            self.bytes = bytes
            endIndex = range.upperBound
            index = range.lowerBound
            self.context = context
        }

        var isAtEnd: Bool {
            index == endIndex
        }

        mutating func readUInt8() throws -> UInt8 {
            guard index < endIndex else {
                throw Violation.truncated(context)
            }
            defer { index += 1 }
            return bytes[index]
        }

        mutating func readUInt16() throws -> UInt16 {
            let high = try UInt16(readUInt8())
            let low = try UInt16(readUInt8())
            return (high << 8) | low
        }

        mutating func readUInt24() throws -> UInt32 {
            let high = try UInt32(readUInt8())
            let middle = try UInt32(readUInt8())
            let low = try UInt32(readUInt8())
            return (high << 16) | (middle << 8) | low
        }

        mutating func readUInt32() throws -> UInt32 {
            let high = try UInt32(readUInt16())
            let low = try UInt32(readUInt16())
            return (high << 16) | low
        }
    }

    static func validate(_ data: Data) throws {
        let transforms = try primaryItemTransforms(in: data)
        guard transforms.count == 1 else {
            throw Violation.associatedTransformCount(transforms.count)
        }
        let transform = transforms[0]
        guard case let .rotation(angle) = transform.value else {
            throw Violation.unexpectedTransform(transform.value.type)
        }
        guard transform.essential else {
            throw Violation.nonessentialTransform(transform.value.type)
        }
        guard angle == 0 else {
            throw Violation.nonidentityRotation(angle)
        }
    }

    private static func primaryItemTransforms(in data: Data) throws -> [AssociatedTransform] {
        let bytes = [UInt8](data)
        let topLevel = try boxes(in: bytes.indices, bytes: bytes)
        let meta = try exactlyOneBox("meta", in: topLevel)
        let metaFullBox = try fullBox(meta, bytes: bytes)
        guard metaFullBox.version == 0 else {
            throw Violation.unsupportedVersion(
                type: "meta",
                version: metaFullBox.version
            )
        }
        guard metaFullBox.flags == 0 else {
            throw Violation.unsupportedFlags(type: "meta", flags: metaFullBox.flags)
        }

        let metaChildren = try boxes(in: metaFullBox.contentRange, bytes: bytes)
        let primaryItemID = try parsePrimaryItemID(
            from: exactlyOneBox("pitm", in: metaChildren),
            bytes: bytes
        )
        let itemProperties = try exactlyOneBox("iprp", in: metaChildren)
        let itemPropertyChildren = try boxes(
            in: itemProperties.payloadRange,
            bytes: bytes
        )
        let propertyBoxes = try boxes(
            in: exactlyOneBox("ipco", in: itemPropertyChildren).payloadRange,
            bytes: bytes
        )
        let associationBoxes = itemPropertyChildren.filter { $0.type == "ipma" }
        guard !associationBoxes.isEmpty else {
            throw Violation.missingBox("ipma")
        }

        let propertyAssociations = try primaryPropertyAssociations(
            primaryItemID: primaryItemID,
            associationBoxes: associationBoxes,
            propertyCount: propertyBoxes.count,
            bytes: bytes
        )
        return try propertyAssociations.compactMap { association in
            guard let value = try transform(
                from: propertyBoxes[association.propertyIndex - 1],
                bytes: bytes
            ) else {
                return nil
            }
            return AssociatedTransform(
                value: value,
                essential: association.essential
            )
        }
    }

    private static func parsePrimaryItemID(
        from box: Box,
        bytes: [UInt8]
    ) throws -> UInt32 {
        let parsed = try fullBox(box, bytes: bytes)
        guard parsed.flags == 0 else {
            throw Violation.unsupportedFlags(type: "pitm", flags: parsed.flags)
        }
        var cursor = Cursor(
            bytes: bytes,
            range: parsed.contentRange,
            context: "pitm"
        )
        let itemID: UInt32
        switch parsed.version {
        case 0:
            itemID = try UInt32(cursor.readUInt16())
        case 1:
            itemID = try cursor.readUInt32()
        default:
            throw Violation.unsupportedVersion(
                type: "pitm",
                version: parsed.version
            )
        }
        guard cursor.isAtEnd else {
            throw Violation.unsupportedFlags(type: "pitm", flags: parsed.flags)
        }
        return itemID
    }

    private static func primaryPropertyAssociations(
        primaryItemID: UInt32,
        associationBoxes: [Box],
        propertyCount: Int,
        bytes: [UInt8]
    ) throws -> [PropertyAssociation] {
        var primaryAssociations: [PropertyAssociation] = []
        for box in associationBoxes {
            let parsed = try fullBox(box, bytes: bytes)
            guard parsed.version == 0 || parsed.version == 1 else {
                throw Violation.unsupportedVersion(
                    type: "ipma",
                    version: parsed.version
                )
            }
            guard parsed.flags & ~UInt32(1) == 0 else {
                throw Violation.unsupportedFlags(type: "ipma", flags: parsed.flags)
            }

            var cursor = Cursor(
                bytes: bytes,
                range: parsed.contentRange,
                context: "ipma"
            )
            let entryCount = try Int(cursor.readUInt32())
            for _ in 0 ..< entryCount {
                let itemID = try parsed.version == 0
                    ? UInt32(cursor.readUInt16())
                    : try cursor.readUInt32()
                let associationCount = try Int(cursor.readUInt8())
                for _ in 0 ..< associationCount {
                    let encodedAssociation: UInt16
                    let propertyIndexMask: UInt16
                    let essentialMask: UInt16
                    if parsed.flags & 1 == 0 {
                        encodedAssociation = try UInt16(cursor.readUInt8())
                        propertyIndexMask = 0x007F
                        essentialMask = 0x0080
                    } else {
                        encodedAssociation = try cursor.readUInt16()
                        propertyIndexMask = 0x7FFF
                        essentialMask = 0x8000
                    }
                    let propertyIndex = Int(encodedAssociation & propertyIndexMask)
                    guard propertyIndex > 0, propertyIndex <= propertyCount else {
                        throw Violation.invalidPropertyIndex(
                            index: propertyIndex,
                            propertyCount: propertyCount
                        )
                    }
                    if itemID == primaryItemID {
                        primaryAssociations.append(
                            PropertyAssociation(
                                propertyIndex: propertyIndex,
                                essential: encodedAssociation & essentialMask != 0
                            )
                        )
                    }
                }
            }
            guard cursor.isAtEnd else {
                throw Violation.truncated("ipma trailing bytes")
            }
        }
        return primaryAssociations
    }

    private static func transform(
        from property: Box,
        bytes: [UInt8]
    ) throws -> Transform? {
        let payload = Array(bytes[property.payloadRange])
        switch property.type {
        case "irot":
            try requirePayload(payload, type: "irot", count: 1)
            guard payload[0] & 0xFC == 0 else {
                throw Violation.nonzeroReservedBits(
                    type: "irot",
                    byte: payload[0]
                )
            }
            return .rotation(payload[0] & 0x03)
        case "imir":
            try requirePayload(payload, type: "imir", count: 1)
            guard payload[0] & 0xFE == 0 else {
                throw Violation.nonzeroReservedBits(
                    type: "imir",
                    byte: payload[0]
                )
            }
            return .mirror(payload[0] & 0x01)
        case "clap":
            try requirePayload(payload, type: "clap", count: 32)
            return .cleanAperture
        default:
            return nil
        }
    }

    private static func requirePayload(
        _ payload: [UInt8],
        type: String,
        count: Int
    ) throws {
        guard payload.count == count else {
            throw Violation.invalidTransformPayload(
                type: type,
                actual: payload.count,
                expected: count
            )
        }
    }

    private static func boxes(
        in range: Range<Int>,
        bytes: [UInt8]
    ) throws -> [Box] {
        var parsed: [Box] = []
        var offset = range.lowerBound
        while offset < range.upperBound {
            guard range.upperBound - offset >= 8 else {
                throw Violation.truncated("box header")
            }
            let size32 = try uint32(at: offset, bytes: bytes)
            guard let type = String(
                bytes: bytes[(offset + 4) ..< (offset + 8)],
                encoding: .ascii
            ) else {
                throw Violation.invalidFourCC
            }

            let headerSize: Int
            let size: UInt64
            switch size32 {
            case 0:
                headerSize = 8
                size = UInt64(range.upperBound - offset)
            case 1:
                guard range.upperBound - offset >= 16 else {
                    throw Violation.truncated("\(type) extended size")
                }
                headerSize = 16
                size = try uint64(at: offset + 8, bytes: bytes)
            default:
                headerSize = 8
                size = UInt64(size32)
            }
            guard size >= UInt64(headerSize) else {
                throw Violation.invalidBoxSize(type: type, size: size)
            }
            guard size <= UInt64(range.upperBound - offset) else {
                throw Violation.boxExtendsPastParent(type)
            }

            let endOffset = offset + Int(size)
            parsed.append(
                Box(
                    type: type,
                    payloadRange: (offset + headerSize) ..< endOffset
                )
            )
            offset = endOffset
        }
        return parsed
    }

    private static func exactlyOneBox(
        _ type: String,
        in boxes: [Box]
    ) throws -> Box {
        let matches = boxes.filter { $0.type == type }
        guard let first = matches.first else {
            throw Violation.missingBox(type)
        }
        guard matches.count == 1 else {
            throw Violation.duplicateBox(type)
        }
        return first
    }

    private static func fullBox(_ box: Box, bytes: [UInt8]) throws -> FullBox {
        guard box.payloadRange.count >= 4 else {
            throw Violation.truncated("\(box.type) full-box header")
        }
        let version = bytes[box.payloadRange.lowerBound]
        let flagsOffset = box.payloadRange.lowerBound + 1
        let flags = (
            UInt32(bytes[flagsOffset]) << 16
                | UInt32(bytes[flagsOffset + 1]) << 8
                | UInt32(bytes[flagsOffset + 2])
        )
        return FullBox(
            version: version,
            flags: flags,
            contentRange: (box.payloadRange.lowerBound + 4) ..< box.payloadRange.upperBound
        )
    }

    private static func uint32(at offset: Int, bytes: [UInt8]) throws -> UInt32 {
        guard offset >= 0, offset + 4 <= bytes.count else {
            throw Violation.truncated("uint32")
        }
        return
            UInt32(bytes[offset]) << 24
                | UInt32(bytes[offset + 1]) << 16
                | UInt32(bytes[offset + 2]) << 8
                | UInt32(bytes[offset + 3])
    }

    private static func uint64(at offset: Int, bytes: [UInt8]) throws -> UInt64 {
        guard offset >= 0, offset + 8 <= bytes.count else {
            throw Violation.truncated("uint64")
        }
        var value: UInt64 = 0
        for byte in bytes[offset ..< (offset + 8)] {
            value = (value << 8) | UInt64(byte)
        }
        return value
    }
}

private enum SyntheticHEIF {
    struct Property {
        let type: String
        let payload: Data

        static func rotation(_ angle: UInt8) -> Self {
            .init(type: "irot", payload: Data([angle]))
        }

        static func mirror(axis: UInt8) -> Self {
            .init(type: "imir", payload: Data([axis]))
        }

        static var cleanAperture: Self {
            .init(type: "clap", payload: Data(repeating: 0, count: 32))
        }
    }

    struct Association {
        let itemID: UInt16
        let propertyIndices: [UInt16]
        let essential: Bool

        init(
            itemID: UInt16,
            propertyIndices: [UInt16],
            essential: Bool = true
        ) {
            self.itemID = itemID
            self.propertyIndices = propertyIndices
            self.essential = essential
        }
    }

    static func make(
        primaryItemID: UInt16 = 1,
        properties: [Property],
        associations: [Association]
    ) -> Data {
        let fileType = box(
            type: "ftyp",
            payload: Data("heic".utf8)
                + uint32(0)
                + Data("mif1heic".utf8)
        )
        let primaryItem = fullBox(
            type: "pitm",
            payload: uint16(primaryItemID)
        )

        var propertyPayload = Data()
        for property in properties {
            propertyPayload.append(
                box(type: property.type, payload: property.payload)
            )
        }
        let propertyContainer = box(type: "ipco", payload: propertyPayload)

        let usesLargePropertyIndices = associations.contains { association in
            association.propertyIndices.contains { $0 > 0x7F }
        }
        var associationPayload = uint32(UInt32(associations.count))
        for association in associations {
            precondition(association.propertyIndices.count <= Int(UInt8.max))
            associationPayload.append(uint16(association.itemID))
            associationPayload.append(UInt8(association.propertyIndices.count))
            for propertyIndex in association.propertyIndices {
                precondition(propertyIndex <= 0x7FFF)
                if usesLargePropertyIndices {
                    let essential = association.essential ? UInt16(0x8000) : 0
                    associationPayload.append(uint16(essential | propertyIndex))
                } else {
                    let essential = association.essential ? UInt8(0x80) : 0
                    associationPayload.append(essential | UInt8(propertyIndex))
                }
            }
        }
        let propertyAssociations = fullBox(
            type: "ipma",
            flags: usesLargePropertyIndices ? 1 : 0,
            payload: associationPayload
        )
        let itemProperties = box(
            type: "iprp",
            payload: propertyContainer + propertyAssociations
        )
        let metadata = fullBox(
            type: "meta",
            payload: primaryItem + itemProperties
        )
        return fileType + metadata
    }

    private static func fullBox(
        type: String,
        version: UInt8 = 0,
        flags: UInt32 = 0,
        payload: Data
    ) -> Data {
        var fullBoxPayload = Data([
            version,
            UInt8((flags >> 16) & 0xFF),
            UInt8((flags >> 8) & 0xFF),
            UInt8(flags & 0xFF)
        ])
        fullBoxPayload.append(payload)
        return box(type: type, payload: fullBoxPayload)
    }

    private static func box(type: String, payload: Data) -> Data {
        let typeBytes = Data(type.utf8)
        precondition(typeBytes.count == 4)
        var encoded = uint32(UInt32(payload.count + 8))
        encoded.append(typeBytes)
        encoded.append(payload)
        return encoded
    }

    private static func uint16(_ value: UInt16) -> Data {
        Data([
            UInt8((value >> 8) & 0xFF),
            UInt8(value & 0xFF)
        ])
    }

    private static func uint32(_ value: UInt32) -> Data {
        Data([
            UInt8((value >> 24) & 0xFF),
            UInt8((value >> 16) & 0xFF),
            UInt8((value >> 8) & 0xFF),
            UInt8(value & 0xFF)
        ])
    }
}

private extension FieldRasterEncodingTests {
    private struct RGBA {
        let r: UInt8
        let g: UInt8
        let b: UInt8
        let a: UInt8
    }

    private func temporaryDirectory() throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func decodedImage(at url: URL) -> CGImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    private func normalizedRGBA(_ image: CGImage) throws -> [UInt8] {
        let width = image.width
        let height = image.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let rendered = bytes.withUnsafeMutableBytes { storage -> Bool in
            guard let base = storage.baseAddress,
                  let context = CGContext(
                    data: base,
                    width: width,
                    height: height,
                    bitsPerComponent: 8,
                    bytesPerRow: width * 4,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
                  ) else {
                return false
            }
            context.interpolationQuality = .none
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard rendered else { throw FieldRasterFixtureError.pixelBufferBaseAddress }
        return bytes
    }

    private func averageColor(
        _ bytes: [UInt8],
        width: Int,
        height: Int,
        around point: FieldRasterFixtureExporter.Point,
        radius: Int
    ) -> RGBA {
        var r = 0, g = 0, b = 0, a = 0, samples = 0
        for y in max(0, point.y - radius)...min(height - 1, point.y + radius) {
            for x in max(0, point.x - radius)...min(width - 1, point.x + radius) {
                let offset = ((y * width) + x) * 4
                r += Int(bytes[offset])
                g += Int(bytes[offset + 1])
                b += Int(bytes[offset + 2])
                a += Int(bytes[offset + 3])
                samples += 1
            }
        }
        return RGBA(
            r: UInt8(r / samples),
            g: UInt8(g / samples),
            b: UInt8(b / samples),
            a: UInt8(a / samples)
        )
    }

    private func rgbaBytes(_ hex: String) throws -> RGBA {
        let value = try #require(UInt32(hex.dropFirst(), radix: 16))
        return RGBA(
            r: UInt8((value >> 24) & 0xFF),
            g: UInt8((value >> 16) & 0xFF),
            b: UInt8((value >> 8) & 0xFF),
            a: UInt8(value & 0xFF)
        )
    }
}

#endif
