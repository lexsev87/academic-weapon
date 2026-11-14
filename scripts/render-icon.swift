// Renders the app icon from square artwork onto a transparent canvas, macOS-style:
// rounded plate on the 824/1024 grid, soft shadow, light-catching inner edge.
// The artwork is slightly enlarged and clipped, so any white corners or edge
// fringe in the source never show; a dark frame around the artwork is trimmed first. Usage: swift render-icon.swift <in> <out.png> [size]
import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: render-icon.swift <in> <out.png> [size]\n".data(using: .utf8)!)
    exit(2)
}
let size = args.count > 3 ? Int(args[3]) ?? 1024 : 1024
let scale = CGFloat(size) / 1024

guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let original = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    FileHandle.standardError.write("cannot read \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

// Artwork that already sits on a dark or transparent frame (an icon exported with its own
// rounded corners) is trimmed to the frame's inner square first, so the frame never shows.
func trimFrame(_ img: CGImage) -> CGImage {
    let w = img.width, h = img.height
    guard let c = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
          let buf = c.data?.assumingMemoryBound(to: UInt8.self) else { return img }
    c.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    // Bitmap rows run top to bottom in memory.
    func isFrame(_ x: Int, _ y: Int) -> Bool {
        let i = (y * w + x) * 4
        let a = Int(buf[i + 3])
        let lum = (Int(buf[i]) + Int(buf[i + 1]) + Int(buf[i + 2])) / 3
        return a < 40 || lum < 14
    }
    var left = 0, right = w - 1, top = 0, bottom = h - 1
    while left < w / 3 && isFrame(left, h / 2) { left += 1 }
    while right > 2 * w / 3 && isFrame(right, h / 2) { right -= 1 }
    while top < h / 3 && isFrame(w / 2, top) { top += 1 }
    while bottom > 2 * h / 3 && isFrame(w / 2, bottom) { bottom -= 1 }
    if left == 0 && top == 0 && right == w - 1 && bottom == h - 1 { return img }
    // Square, centred, a little inside the frame to drop its anti-aliased edge.
    let side = min(right - left, bottom - top)
    let pad = Int(Double(side) * 0.012)
    let rect = CGRect(x: left + pad, y: top + pad, width: side - 2 * pad, height: side - 2 * pad)
    return img.cropping(to: rect) ?? img
}
let art = trimFrame(original)

let space = CGColorSpace(name: CGColorSpace.sRGB)!
guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                          space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(1) }
ctx.clear(CGRect(x: 0, y: 0, width: size, height: size)) // fully transparent
ctx.scaleBy(x: scale, y: scale)
ctx.interpolationQuality = .high

let plate = CGRect(x: 100, y: 100, width: 824, height: 824)
let path = CGPath(roundedRect: plate, cornerWidth: 185, cornerHeight: 185, transform: nil)

// Shadow under the plate (y grows upwards in Core Graphics, so offset is negative).
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -12), blur: 28, color: CGColor(gray: 0, alpha: 0.32))
ctx.addPath(path)
ctx.setFillColor(CGColor(srgbRed: 0.1, green: 0.14, blue: 0.2, alpha: 1))
ctx.fillPath()
ctx.restoreGState()

// Artwork, enlarged by 3% so the source's own white corners and edges fall outside the clip.
ctx.saveGState()
ctx.addPath(path)
ctx.clip()
ctx.draw(art, in: plate.insetBy(dx: -25, dy: -25))
ctx.restoreGState()

// Thin inner highlight, like light catching the edge.
ctx.addPath(CGPath(roundedRect: plate.insetBy(dx: 1.5, dy: 1.5), cornerWidth: 183.5, cornerHeight: 183.5, transform: nil))
ctx.setStrokeColor(CGColor(gray: 1, alpha: 0.14))
ctx.setLineWidth(3)
ctx.strokePath()

guard let out = ctx.makeImage(),
      let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, out, nil)
guard CGImageDestinationFinalize(dest) else { exit(1) }
