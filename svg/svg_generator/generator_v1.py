import numpy as np
import matplotlib.pyplot as plt
import matplotlib
import re
import os

matplotlib.use('Agg')

# Use built-in Matplotlib simplification to reduce points before saving
matplotlib.rcParams['path.simplify'] = True
matplotlib.rcParams['path.simplify_threshold'] = 1.0

def generate_smooth_mountains(x, y, seed=None):
    if seed is not None:
        np.random.seed(seed)
    
    # 1. Start with a base of "Fractal" Noise
    # Instead of one big wave, we stack several layers of different frequencies
    z = np.zeros_like(x)
    for i in range(1, 4):
        freq = i * np.random.uniform(0.5, 0.8)
        amp = 1.0 / i
        phase_x = np.random.uniform(0, 2*np.pi)
        phase_y = np.random.uniform(0, 2*np.pi)
        angle = np.random.uniform(0, np.pi) # Rotate layers to break the grid
        
        x_rot = x * np.cos(angle) - y * np.sin(angle)
        y_rot = x * np.sin(angle) + y * np.cos(angle)
        
        z += amp * np.sin(freq * x_rot + phase_x) * np.cos(freq * y_rot + phase_y)

    # 2. Add localized "Mountain Massifs" (3-5 random high points)
    num_peaks = np.random.randint(1, 4)
    for _ in range(num_peaks):
        px = np.random.uniform(-4, 4)
        py = np.random.uniform(-14, 14)
        p_amp = np.random.uniform(1.5, 2.5)
        p_size = np.random.uniform(0.1, 0.9)
        p_freq = np.random.uniform(1.8, 5.5)
        
        dist = np.sqrt((x - px)**2 + (y - py)**2)
        # Radial decay + ripples to create ridges
        z += p_amp * np.exp(-p_size * dist) * np.cos(p_freq * dist)

    # 3. Create sharper peaks and flatter valleys (Natural erosion look)
    # Raising to a power (and keeping sign) makes high points sharper
    z = np.sign(z) * (np.abs(z) ** 1.3)

    return z

def create_topographic_svg(filename='mountain_topology.svg', resolution=240, num_levels=45, seed=60):
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
        # FIX: Added linestyles='solid' to override default dashed lines for negative values
        ax.contour(X, Y, Z, levels=[level], colors='black', linewidths=0.4, alpha=opacity, linestyles='solid')
    
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

    # 1. REMOVE JUNK (Comments and Metadata)
    content = re.sub(r'', '', content, flags=re.DOTALL)
    content = re.sub(r'<metadata>.*?</metadata>', '', content, flags=re.DOTALL)
    
    # 2. REMOVE IDs
    content = re.sub(r' id="[^"]+"', '', content)

    # 3. COORDINATE ROUNDING
    def shrink_num(match):
        num = float(match.group(0))
        return f"{num:.1f}".rstrip('0').rstrip('.')

    content = re.sub(r'-?\d+\.\d{2,}', shrink_num, content)

    # 4. WHITESPACE (Surgical)
    content = re.sub(r'\s+', ' ', content)

    # 5. REMOVE FIXED DIMENSIONS FOR RESPONSIVENESS
    content = re.sub(r'width="[^"]+"', '', content, count=1)
    content = re.sub(r'height="[^"]+"', '', content, count=1)
    
    with open(filename, 'w') as f:
        f.write(content)
    
    return os.path.getsize(filename) / 1024

if __name__ == "__main__":
    create_topographic_svg()