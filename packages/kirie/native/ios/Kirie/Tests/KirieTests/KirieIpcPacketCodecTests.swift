import Foundation
import XCTest

final class KirieIpcPacketCodecTests: XCTestCase {
    func testTextLaneUsesCborTextString() throws {
        let packet = KirieIpcPacketCodec.encodeText("kirie:cbor")

        XCTAssertEqual(packet.kirieHexString, "6a6b697269653a63626f72")
        XCTAssertEqual(try KirieIpcPacketCodec.decodeText(packet), "kirie:cbor")
    }

    func testBinaryLaneUsesCborByteString() throws {
        let bytes = Data([0, 1, 2, 127, 128, 255])
        let packet = KirieIpcPacketCodec.encodeBinary(bytes)

        XCTAssertEqual(packet.kirieHexString, "460001027f80ff")
        XCTAssertEqual(try KirieIpcPacketCodec.decodeBinary(packet), bytes)
    }

    func testDataLaneUsesCborDataItemSubset() throws {
        let value = KirieIpcValue.array([
            .string("kirie-cbor"),
            .int(42),
            .null,
            .map(["lane": .string("data")]),
            .double(1.5),
            .bool(true),
            .bool(false),
            .int(-1),
        ])

        let packet = KirieIpcPacketCodec.encodeData(value)

        XCTAssertEqual(
            packet.kirieHexString,
            "886a6b697269652d63626f72182af6a1646c616e656464617461fb3ff8000000000000f5f420"
        )
        XCTAssertEqual(try KirieIpcPacketCodec.decodeData(packet), value)
    }
}

private extension Data {
    var kirieHexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
