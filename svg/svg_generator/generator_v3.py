import numpy as np
import matplotlib.pyplot as plt
import matplotlib
import re
import os

matplotlib.use('Agg')

# 1. FIX: Set threshold to the maximum allowed (1.0)
matplotlib.rcParams['path.simplify'] = True
matplotlib.rcParams['path.simplify_threshold'] = 1.0

def generate_tectonic_faults(x, y, seed=None):
    if seed is not None:
        np.random.seed(seed)
    
    # 1. Domain Warping: Distort the input coordinates
    # This makes the "straight" fault lines look wiggly and organic
    warp_amp = 0.6
    x_warp = x + warp_amp * np.sin(0.5 * y)
    y_warp = y + warp_amp * np.cos(0.5 * x)
    
    # 2. Primary Fault Line
    # tanh creates a "step" function (sudden jump from -1 to 1)
    angle = np.random.uniform(0, np.pi)
    direction = x_warp * np.cos(angle) + y_warp * np.sin(angle)
    z = 2.0 * np.tanh(2.0 * direction)
    
    # 3. Secondary Micro-Faults (The "Stepping" effect)
    for i in range(1, 4):
        freq = i * 0.8
        shift = np.random.uniform(-5, 5)
        z += (0.5 / i) * np.tanh(freq * (x_warp + shift))

    # 4. Add "Crackle" Noise for texture
    # High frequency, low amplitude noise to create dense contour clusters
    z += 0.15 * np.sin(4 * x) * np.sin(4 * y)
    
    return z
def create_topographic_svg(filename='pattern_topology.svg', resolution=210, num_levels=34, seed=800):
    # Optimization: Reducing resolution to 200 and levels to 35 
    # provides a huge size saving with almost no visible loss in quality.
    x = np.linspace(-5, 5, resolution)
    y = np.linspace(-15, 15, resolution)
    X, Y = np.meshgrid(x, y)
    Z = generate_tectonic_faults(X, Y, seed=seed)
    
    fig, ax = plt.subplots(figsize=(5, 15))
    fig.patch.set_alpha(0)
    ax.patch.set_alpha(0)
    
    levels = np.linspace(Z.min(), Z.max(), num_levels)
    
    for i, level in enumerate(levels):
        opacity = round(i / (num_levels - 1), 2)
        # Using a thinner linewidth also helps complex SVGs look cleaner on high-DPI screens
        ax.contour(X, Y, Z, levels=[level], colors="#858585", linewidths=0.3, alpha=opacity, linestyles='solid')
    
    ax.set_aspect('equal')
    ax.axis('off')
    plt.subplots_adjust(left=0, right=1, top=1, bottom=0)
    
    plt.savefig(filename, format='svg', bbox_inches='tight', pad_inches=0, transparent=True)
    plt.close()
    
    initial_size = os.path.getsize(filename) / 1024
    optimized_size = bulletproof_optimize(filename)
    print(f"Done! Initial: {initial_size:.1f}KB | Optimized: {optimized_size:.1f}KB")

def bulletproof_optimize(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # 1. REMOVE JUNK & METADATA
    content = re.sub(r'', '', content, flags=re.DOTALL)
    content = re.sub(r'<metadata>.*?</metadata>', '', content, flags=re.DOTALL)
    
    # 2. STRIP XML BLOAT
    content = re.sub(r' id="[^"]+"', '', content)
    content = re.sub(r' version="1.1"', '', content)
    content = re.sub(r' xmlns:xlink="http://www.w3.org/1999/xlink"', '', content)
    content = re.sub(r' xmlns="http://www.w3.org/2000/svg"', ' xmlns="http://www.w3.org/2000/svg"', content)

    # 3. AGGRESSIVE COORDINATE ROUNDING
    # This rounds numbers like 123.4567 to 123.5, significantly cutting string length
    def shrink_num(match):
        num = float(match.group(0))
        return f"{num:.1f}".rstrip('0').rstrip('.')

    content = re.sub(r'-?\d+\.\d{2,}', shrink_num, content)

    # 4. SURGICAL WHITESPACE & UNIT REMOVAL
    content = re.sub(r'\s+', ' ', content)
    content = content.replace('pt"', '"').replace('pt ', ' ') # Strips 'pt' units to save bytes

    # 5. ENSURE RESPONSIVENESS
    content = re.sub(r'width="[^"]+"', '', content, count=1)
    content = re.sub(r'height="[^"]+"', '', content, count=1)
    
    with open(filename, 'w') as f:
        f.write(content.strip())
    
    return os.path.getsize(filename) / 1024

if __name__ == "__main__":
    create_topographic_svg()