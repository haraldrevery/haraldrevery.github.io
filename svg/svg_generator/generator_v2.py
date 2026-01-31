import numpy as np
import matplotlib.pyplot as plt
import matplotlib
import re
import os

matplotlib.use('Agg')

# 1. FIX: Set threshold to the maximum allowed (1.0)
matplotlib.rcParams['path.simplify'] = True
matplotlib.rcParams['path.simplify_threshold'] = 1.0

def generate_smooth_mountains(x, y, seed=None):
    if seed is not None:
        np.random.seed(seed)
    
    z = np.zeros_like(x)
    for i in range(1, 4):
        freq = i * np.random.uniform(0.4, 0.75)
        amp = 1.0 / i
        phase_x = np.random.uniform(0, 2*np.pi)
        phase_y = np.random.uniform(0, 2*np.pi)
        angle = np.random.uniform(0, np.pi)
        
        x_rot = x * np.cos(angle) - y * np.sin(angle)
        y_rot = x * np.sin(angle) + y * np.cos(angle)
        z += amp * np.sin(freq * x_rot + phase_x) * np.cos(freq * y_rot + phase_y)

    num_peaks = np.random.randint(0, 2)
    for _ in range(num_peaks):
        px = np.random.uniform(-4, 4)
        py = np.random.uniform(-14, 14) # Distributed across height
        p_amp = np.random.uniform(1.5, 2.7)
        p_size = np.random.uniform(0.1, 2.96)
        p_freq = np.random.uniform(1.1, 5.5)
        
        dist = np.sqrt((x - px)**2 + (y - py)**2)
        z += p_amp * np.exp(-p_size * dist) * np.cos(p_freq * dist)

    z = np.sign(z) * (np.abs(z) ** 1.4)
    return z

def create_topographic_svg(filename='mountain_topology.svg', resolution=210, num_levels=34, seed=19852):
    # Optimization: Reducing resolution to 200 and levels to 35 
    # provides a huge size saving with almost no visible loss in quality.
    x = np.linspace(-5, 5, resolution)
    y = np.linspace(-15, 15, resolution)
    X, Y = np.meshgrid(x, y)
    Z = generate_smooth_mountains(X, Y, seed=seed)
    
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