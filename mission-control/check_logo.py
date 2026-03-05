from PIL import Image
import os

filepath = 'c:/Users/fabao/Documents/VizaionClaw/mission-control/public/logo.png'
if not os.path.exists(filepath):
    print(f"File {filepath} not found.")
else:
    img = Image.open(filepath)
    img = img.convert("RGBA")
    
    # Check the corners explicitly
    width, height = img.size
    corners = [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1)
    ]
    
    print(f"Image size is {width}x{height}")
    print("Corner pixels (R, G, B, A):")
    for cx, cy in corners:
        pixel = img.getpixel((cx, cy))
        print(f"  ({cx}, {cy}) -> {pixel}")
    
    # Calculate transparency percentage
    transparent_pixels = sum(1 for p in img.getdata() if p[3] == 0)
    total_pixels = width * height
    print(f"Transparent pixels: {transparent_pixels} / {total_pixels} ({(transparent_pixels/total_pixels)*100:.2f}%)")
